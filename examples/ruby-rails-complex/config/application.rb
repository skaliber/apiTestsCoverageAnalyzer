# frozen_string_literal: true

require_relative "boot"

require "rails/all"

Bundler.require(*Rails.groups)

module RubyRailsComplex
  class Application < Rails::Application
    config.load_defaults 7.1

    # API-only mode
    config.api_only = true

    # Timezone
    config.time_zone = "UTC"

    # Autoload paths
    config.autoload_paths += %W[
      #{config.root}/app/services
      #{config.root}/app/helpers
    ]

    # Middleware
    config.middleware.use ActionDispatch::Flash
    config.middleware.use Rack::MethodOverride

    # CORS configuration
    config.middleware.insert_before 0, Rack::Cors do
      allow do
        origins ENV.fetch("ALLOWED_ORIGINS", "*")
        resource "*",
                 headers: :any,
                 methods: [:get, :post, :put, :patch, :delete, :options, :head],
                 expose: ["Authorization"],
                 max_age: 600
      end
    end

    # Logging
    config.log_level = ENV.fetch("LOG_LEVEL", "info").to_sym
    config.log_tags = [:request_id]

    # Exceptions
    config.exceptions_app = routes

    # Active Job
    config.active_job.queue_adapter = :sidekiq

    # Cache store
    config.cache_store = :redis_cache_store, {
      url: ENV.fetch("REDIS_URL", "redis://localhost:6379/0"),
      expires_in: 1.hour
    }
  end
end
