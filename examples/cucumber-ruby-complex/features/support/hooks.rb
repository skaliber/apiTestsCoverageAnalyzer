# frozen_string_literal: true

# hooks.rb - Cucumber lifecycle hooks
# Controls test setup, teardown, and scenario-level reset behavior.

# ─── Global Before/After Hooks ────────────────────────────────────────────────

Before do
  # Reset the API client to default (unauthenticated) state before each scenario.
  # Individual scenarios set their own auth via "Given I am authenticated as..." steps.
  ApiClient.configure(headers: {
    "Content-Type" => "application/json",
    "Accept"       => "application/json"
  })

  # Clear scenario-level instance variables
  @response       = nil
  @last_payment   = nil
  @last_refund    = nil
  @last_dispute   = nil
  @last_webhook   = nil
  @webhook_secret = nil
end

After do |scenario|
  # Log failures with response details to aid debugging
  if scenario.failed?
    puts "\n[FAILURE] Scenario: #{scenario.name}"
    if @response
      puts "  Last response status: #{@response.status}"
      puts "  Last response body:   #{@response.body[0..500]}"
    end
  end

  # Clean up downstream timeout simulation flag after each scenario
  TestEnvironment.simulate_downstream_timeout(false)
end

# ─── Tag-Based Hooks ──────────────────────────────────────────────────────────

Before("@smoke") do
  puts "[SMOKE] Running smoke scenario"
end

Before("@security") do
  # Ensure we start from a clean, unauthenticated state for security tests
  ApiClient.configure(headers: {})
end

Before("@rate_limiting") do
  # Allow tests that intentionally exceed rate limits to proceed without
  # automatic backoff logic interfering
  puts "[RATE LIMIT TEST] Rate limiting scenario - intentional high-volume requests"
end

Before("@admin") do
  # Admin scenarios must use the admin API key set in env.rb
  @auth_headers = AuthHelper.admin_auth_headers
  ApiClient.configure(headers: @auth_headers)
end

# ─── VCR Cassette Hooks (when VCR is available) ───────────────────────────────

if defined?(VCR)
  Around do |scenario, block|
    cassette_name = scenario.name.downcase.gsub(/[^a-z0-9]+/, "_")
    if ENV["VCR_RECORD"] == "true"
      VCR.use_cassette(cassette_name, record: :new_episodes, &block)
    elsif ENV["VCR_PLAYBACK"] == "true"
      VCR.use_cassette(cassette_name, record: :none, &block)
    else
      block.call
    end
  end
end

# ─── Database / Fixture Teardown ──────────────────────────────────────────────

After do
  # In integration/E2E mode, clean up test data created during the scenario.
  # Uses a test-only reset endpoint provided by the local Sinatra server.
  if ENV["CLEANUP_AFTER_SCENARIO"] == "true"
    ApiClient.post("/test/reset", body: { merchant_id: @current_merchant_id })
  end
end
