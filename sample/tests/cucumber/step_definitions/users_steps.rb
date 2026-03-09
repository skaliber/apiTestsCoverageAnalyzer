# Sample Ruby step definitions for the Users API Cucumber feature.
#
# Uses HTTParty to make HTTP calls against the running service.

require 'httparty'
require 'json'

BASE_URL = 'http://localhost:8080'.freeze

# ── Background ──────────────────────────────────────────────────────────────

Given('the API is running at {string}') do |_url|
  # nothing to set up for sample purposes
end

# ── Request helpers ─────────────────────────────────────────────────────────

Given('I have a JSON body {string}') do |body|
  @request_body = body
end

When('I send a GET request to {word}') do |path|
  @response = HTTParty.get("#{BASE_URL}#{path}")
end

When('I send a POST request to {word}') do |path|
  headers = { 'Content-Type' => 'application/json' }
  @response = HTTParty.post("#{BASE_URL}#{path}", body: @request_body, headers: headers)
end

When('I send a PUT request to {word}') do |path|
  headers = { 'Content-Type' => 'application/json' }
  @response = HTTParty.put("#{BASE_URL}#{path}", body: @request_body, headers: headers)
end

When('I send a DELETE request to {word}') do |path|
  @response = HTTParty.delete("#{BASE_URL}#{path}")
end

# ── Assertions ──────────────────────────────────────────────────────────────

Then('the response status should be {int}') do |expected_status|
  expect(@response.code).to eq(expected_status)
end

Then('the response body should be a JSON array') do
  body = JSON.parse(@response.body)
  expect(body).to be_an(Array)
end

Then('the response body should contain {string}') do |text|
  expect(@response.body).to include(text)
end

Then('the response content-type should include {string}') do |content_type|
  expect(@response.headers['content-type']).to include(content_type)
end
