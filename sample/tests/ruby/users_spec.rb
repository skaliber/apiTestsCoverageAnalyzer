# Sample RSpec test suite for the Users / Orders API.
#
# Uses Rails request-spec helpers (get, post, put, delete) to exercise the API.
#
# Covers:
#   GET  /users          – list all users
#   POST /users          – create a user
#   GET  /users/{id}     – get user by ID
#   GET  /orders         – list orders
#   POST /orders         – create an order
#
# Not covered (gap):
#   PUT    /users/{id}   – update user
#   DELETE /users/{id}   – delete user

require 'spec_helper'

RSpec.describe 'Users API', type: :request do

  # ── GET /users ─────────────────────────────────────────────────────────────

  describe 'GET /users' do
    it 'returns 200 and a JSON array' do
      get '/users'
      expect(response.status).to eq(200)
      expect(JSON.parse(response.body)).to be_an(Array)
    end

    it 'returns content-type application/json' do
      get '/users'
      expect(response.content_type).to include('application/json')
    end
  end

  # ── POST /users ────────────────────────────────────────────────────────────

  describe 'POST /users' do
    context 'with a valid payload' do
      it 'creates the user and returns 201' do
        post '/users',
             params: { name: 'Alice', email: 'alice@example.com' }.to_json,
             headers: { 'Content-Type' => 'application/json' }
        expect(response.status).to eq(201)
        expect(JSON.parse(response.body)['name']).to eq('Alice')
      end
    end

    context 'when the name is missing' do
      it 'returns 400 with an error message' do
        post '/users',
             params: { email: 'noname@example.com' }.to_json,
             headers: { 'Content-Type' => 'application/json' }
        expect(response.status).to eq(400)
        expect(JSON.parse(response.body)['error']).to include('name')
      end
    end
  end

  # ── GET /users/:id ─────────────────────────────────────────────────────────

  describe 'GET /users/:id' do
    context 'when the user exists' do
      it 'returns 200 with the user data' do
        get '/users/1'
        expect(response.status).to eq(200)
      end
    end

    context 'when the user does not exist' do
      it 'returns 404' do
        get '/users/999999'
        expect(response.status).to eq(404)
      end
    end
  end

  # ── GET /orders ────────────────────────────────────────────────────────────

  describe 'GET /orders' do
    it 'returns 200' do
      get '/orders'
      expect(response.status).to eq(200)
    end
  end

  # ── POST /orders ───────────────────────────────────────────────────────────

  describe 'POST /orders' do
    it 'creates an order and returns 201' do
      post '/orders',
           params: { userId: 1, item: 'widget', quantity: 2 }.to_json,
           headers: { 'Content-Type' => 'application/json' }
      expect(response.status).to eq(201)
    end
  end
end
