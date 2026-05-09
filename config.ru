require 'dotenv/load' rescue nil
require './app'
run Sinatra::Application
