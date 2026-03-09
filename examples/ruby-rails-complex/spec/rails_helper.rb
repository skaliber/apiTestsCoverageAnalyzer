# frozen_string_literal: true

ENV["RAILS_ENV"] ||= "test"

require_relative "../config/application"
require "rspec/rails"
require "factory_bot_rails"

# Helpers
Dir[Rails.root.join("spec/support/**/*.rb")].sort.each { |f| require f }

RSpec.configure do |config|
  config.fixture_path = Rails.root.join("spec/fixtures")
  config.use_transactional_fixtures = true
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!

  config.include FactoryBot::Syntax::Methods
  config.include ApiSpecHelpers, type: :request
  config.include AuthHelpers, type: :request

  config.before(:each, type: :request) do
    host! "localhost:3000"
  end
end
