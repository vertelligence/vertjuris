require 'sinatra'
require 'sinatra/reloader' if development?
require 'httparty'
require 'json'

set :public_folder, File.expand_path('public', __dir__)
set :views,         File.expand_path('views',  __dir__)

RAILS_API_URL = ENV.fetch('RAILS_API_URL', 'http://127.0.0.1:3000')
API_TOKEN     = ENV.fetch('API_TOKEN', '')
MAX_ROWS      = 50

# Column keys mirror the Rails-side payload contract.
# `public_id` is optional; either `public_id` or `name` must be present per row.
# `citation` is optional and cites the law on its row, so it needs a Law Name.
COLUMNS = [
  { key: 'public_id',         label: 'Jurisdiction Public ID', hint: 'optional, e.g. KOR' },
  { key: 'jurisdiction_name', label: 'Jurisdiction Name',      hint: 'required if no public_id' },
  { key: 'agreement_name',    label: 'Law Name',         hint: '' },
  { key: 'description',       label: 'Law Description',  hint: '' },
  { key: 'year',              label: 'Material Year',                   hint: 'YYYY' },
  { key: 'date_accepted',     label: 'Date Passed by Legislature',          hint: 'YYYY-MM-DD' },
  { key: 'entry_into_force',  label: 'Entry into Force',       hint: 'YYYY-MM-DD' },
  { key: 'citation',          label: 'Citation',               hint: 'optional, source of the law' }
].freeze

helpers do
  def h(text)
    Rack::Utils.escape_html(text.to_s)
  end
end

get '/' do
  erb :index, locals: {
    error:    nil,
    success:  nil,
    rails_url: RAILS_API_URL,
    api_token: '',
    columns:  COLUMNS,
    max_rows: MAX_ROWS
  }
end

post '/agreements' do
  rails_url = params[:rails_url].to_s.strip.chomp('/')
  rails_url = RAILS_API_URL if rails_url.empty?
  api_token = params[:api_token].to_s.strip
  api_token = API_TOKEN     if api_token.empty?

  if rails_url.empty? || api_token.empty?
    return erb :index, locals: {
      error:     'Please enter a Rails API URL and API token.',
      success:   nil,
      rails_url: rails_url,
      api_token: api_token,
      columns:   COLUMNS,
      max_rows:  MAX_ROWS
    }
  end

  # params[:rows] arrives as { "0" => {col => val, ...}, "1" => {...}, ... }
  raw_rows = (params[:rows] || {}).values

  # Group rows by jurisdiction (public_id preferred, else normalized name).
  # This lets the Rails service receive one entry per jurisdiction with its
  # nested agreements, rather than re-resolving the parent N times.
  groups = {}
  raw_rows.each do |row|
    next if row.values.all? { |v| v.to_s.strip.empty? }

    public_id = row['public_id'].to_s.strip
    name      = row['jurisdiction_name'].to_s.strip
    next if public_id.empty? && name.empty? # server-side either/or guard

    key = public_id.empty? ? "name:#{name.downcase}" : "pid:#{public_id}"
    groups[key] ||= {
      public_id: public_id.empty? ? nil : public_id,
      name:      name.empty?      ? nil : name,
      agreements: []
    }

    agreement = {
      name:             row['agreement_name'].to_s.strip,
      description:      row['description'].to_s.strip,
      year:             row['year'].to_s.strip,
      date_accepted:    row['date_accepted'].to_s.strip,
      entry_into_force: row['entry_into_force'].to_s.strip
    }
    # Skip rows where every agreement field is blank (jurisdiction-only row). A citation
    # alone doesn't make a law, so it's only sent along with one.
    unless agreement.values.all?(&:empty?)
      groups[key][:agreements] << agreement.merge(citation: row['citation'].to_s.strip)
    end
  end

  payload = { jurisdictions: groups.values }

  if payload[:jurisdictions].empty?
    return erb :index, locals: {
      error:     'No valid rows to submit. Each row needs a public_id or a jurisdiction name.',
      success:   nil,
      rails_url: rails_url,
      api_token: api_token,
      columns:   COLUMNS,
      max_rows:  MAX_ROWS
    }
  end

  begin
    response = HTTParty.post(
      "#{rails_url}/api/v1/agreements",
      headers: {
        'Content-Type'  => 'application/json',
        'Authorization' => "Bearer #{api_token}"
      },
      body:    payload.to_json,
      timeout: 30
    )
  rescue StandardError => e
    return erb :index, locals: {
      error:     "Network error: #{e.class} — #{e.message}",
      success:   nil,
      rails_url: rails_url,
      api_token: api_token,
      columns:   COLUMNS,
      max_rows:  MAX_ROWS
    }
  end

  if response.success?
    result  = response.parsed_response.is_a?(Hash) ? response.parsed_response : {}
    created = result['created'] || []
    matched = result['matched'] || []
    errors  = result['errors']  || []

    error_messages = errors.map do |e|
      label = e['public_id'] || e['name'] || 'row'
      "#{label}: #{Array(e['errors']).join(', ')}"
    end

    success_msg = "Batch submitted — #{created.count} created, #{matched.count} matched, #{errors.count} errors."
    error_msg   = error_messages.any? ? error_messages.join(' | ') : nil

    erb :index, locals: {
      error:     error_msg,
      success:   success_msg,
      rails_url: rails_url,
      api_token: api_token,
      columns:   COLUMNS,
      max_rows:  MAX_ROWS
    }
  else
    body = response.parsed_response
    detail = body.is_a?(Hash) ? (body['error'] || body.to_s) : body.to_s
    erb :index, locals: {
      error:     "HTTP #{response.code}: #{detail}",
      success:   nil,
      rails_url: rails_url,
      api_token: api_token,
      columns:   COLUMNS,
      max_rows:  MAX_ROWS
    }
  end
end
