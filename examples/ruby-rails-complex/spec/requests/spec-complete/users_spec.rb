# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC
# Covers 100% of user endpoints including error paths, auth, and business rules.
# Business Rules covered: user-deletion-requires-admin

RSpec.describe "Users API - Complete Coverage", type: :request do
  let(:admin_role) { create(:role, name: "admin") }
  let(:member_role) { create(:role, name: "member") }

  let(:admin_user) { create(:user, role: admin_role) }
  let(:regular_user) { create(:user, role: member_role) }
  let(:another_user) { create(:user, role: member_role) }

  let(:admin_headers) { auth_headers_for(admin_user) }
  let(:user_headers) { auth_headers_for(regular_user) }
  let(:invalid_headers) { { "Authorization" => "Bearer invalid_token", "Content-Type" => "application/json" } }

  describe "POST /api/v1/users" do
    let(:valid_params) do
      {
        user: {
          email: "newuser@example.com",
          password: "SecurePass123!",
          first_name: "Jane",
          last_name: "Doe",
          company_name: "Acme Corp",
          timezone: "America/New_York"
        }
      }
    end

    context "with valid parameters" do
      it "creates a user and returns 201" do
        post "/api/v1/users", params: valid_params, headers: admin_headers

        expect(response).to have_http_status(:created)
        json = JSON.parse(response.body)
        expect(json["data"]["email"]).to eq("newuser@example.com")
        expect(json["data"]["first_name"]).to eq("Jane")
        expect(json["data"]["company_name"]).to eq("Acme Corp")
      end

      it "downcases the email" do
        post "/api/v1/users",
             params: { user: valid_params[:user].merge(email: "UPPER@EXAMPLE.COM") },
             headers: admin_headers

        json = JSON.parse(response.body)
        expect(json["data"]["email"]).to eq("upper@example.com")
      end

      it "creates an audit log entry" do
        expect {
          post "/api/v1/users", params: valid_params, headers: admin_headers
        }.to change(AuditLog, :count).by(1)

        expect(AuditLog.last.action).to eq("user_created")
      end
    end

    context "with invalid parameters" do
      it "returns 422 when email is missing" do
        post "/api/v1/users",
             params: { user: valid_params[:user].except(:email) },
             headers: admin_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["errors"]).to include(match(/email/i))
      end

      it "returns 422 when first_name is missing" do
        post "/api/v1/users",
             params: { user: valid_params[:user].except(:first_name) },
             headers: admin_headers

        expect(response).to have_http_status(:unprocessable_entity)
      end

      it "returns 422 when password is too short" do
        post "/api/v1/users",
             params: { user: valid_params[:user].merge(password: "short") },
             headers: admin_headers

        expect(response).to have_http_status(:unprocessable_entity)
      end

      it "returns 422 with duplicate email" do
        create(:user, email: "newuser@example.com")

        post "/api/v1/users", params: valid_params, headers: admin_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["errors"]).to include(match(/email.*taken/i))
      end

      it "returns 422 with invalid email format" do
        post "/api/v1/users",
             params: { user: valid_params[:user].merge(email: "not-an-email") },
             headers: admin_headers

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        post "/api/v1/users", params: valid_params

        expect(response).to have_http_status(:unauthorized)
      end

      it "returns 401 with an invalid token" do
        post "/api/v1/users", params: valid_params, headers: invalid_headers

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET /api/v1/users" do
    before { create_list(:user, 10) }

    context "as an authenticated user" do
      it "returns a paginated list of users" do
        get "/api/v1/users", headers: admin_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]).to be_an(Array)
        expect(json["meta"]).to include(
          "current_page", "total_pages", "total_count", "per_page"
        )
      end

      it "respects per_page parameter" do
        get "/api/v1/users", params: { per_page: 3 }, headers: admin_headers

        json = JSON.parse(response.body)
        expect(json["data"].length).to be <= 3
        expect(json["meta"]["per_page"]).to eq(3)
      end

      it "supports pagination" do
        get "/api/v1/users", params: { page: 2, per_page: 5 }, headers: admin_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["meta"]["current_page"]).to eq(2)
      end

      it "does not return soft-deleted users" do
        deleted_user = create(:user, deleted_at: Time.current)

        get "/api/v1/users", headers: admin_headers

        json = JSON.parse(response.body)
        user_ids = json["data"].map { |u| u["id"] }
        expect(user_ids).not_to include(deleted_user.id)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        get "/api/v1/users"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "GET /api/v1/users/:id" do
    context "with a valid user ID" do
      it "returns the user" do
        get "/api/v1/users/#{regular_user.id}", headers: user_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["id"]).to eq(regular_user.id)
        expect(json["data"]["email"]).to eq(regular_user.email)
      end

      it "returns expected user fields" do
        get "/api/v1/users/#{regular_user.id}", headers: user_headers

        json = JSON.parse(response.body)
        expect(json["data"].keys).to include(
          "id", "email", "first_name", "last_name", "role", "active", "created_at"
        )
      end
    end

    context "with an invalid user ID" do
      it "returns 404" do
        get "/api/v1/users/99999999", headers: user_headers

        expect(response).to have_http_status(:not_found)
        expect(JSON.parse(response.body)["error"]).to match(/not found/i)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        get "/api/v1/users/#{regular_user.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "PUT /api/v1/users/:id" do
    context "with valid parameters" do
      it "updates the user" do
        put "/api/v1/users/#{regular_user.id}",
            params: { user: { first_name: "Updated", company_name: "New Corp" } },
            headers: user_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["first_name"]).to eq("Updated")
        expect(json["data"]["company_name"]).to eq("New Corp")
      end

      it "creates an audit log entry" do
        expect {
          put "/api/v1/users/#{regular_user.id}",
              params: { user: { first_name: "Updated" } },
              headers: user_headers
        }.to change(AuditLog, :count).by(1)

        expect(AuditLog.last.action).to eq("user_updated")
      end
    end

    context "with invalid parameters" do
      it "returns 422 when removing required fields" do
        put "/api/v1/users/#{regular_user.id}",
            params: { user: { first_name: "" } },
            headers: user_headers

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    context "with a non-existent user" do
      it "returns 404" do
        put "/api/v1/users/99999999",
            params: { user: { first_name: "Test" } },
            headers: user_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        put "/api/v1/users/#{regular_user.id}",
            params: { user: { first_name: "Test" } }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end

  describe "DELETE /api/v1/users/:id" do
    # Business Rule: user-deletion-requires-admin

    context "as an admin" do
      it "soft-deletes another user and returns 200" do
        delete "/api/v1/users/#{another_user.id}", headers: admin_headers

        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)["message"]).to match(/deleted/i)
        expect(another_user.reload.deleted_at).not_to be_nil
      end

      it "creates an audit log entry" do
        expect {
          delete "/api/v1/users/#{another_user.id}", headers: admin_headers
        }.to change(AuditLog, :count).by(1)

        expect(AuditLog.last.action).to eq("user_deleted")
      end

      it "returns 403 when trying to delete own account" do
        delete "/api/v1/users/#{admin_user.id}", headers: admin_headers

        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)["error"]).to match(/own account/i)
      end

      it "returns 404 when user does not exist" do
        delete "/api/v1/users/99999999", headers: admin_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "as a non-admin (business rule: user-deletion-requires-admin)" do
      it "returns 403 when a regular user tries to delete another user" do
        delete "/api/v1/users/#{another_user.id}", headers: user_headers

        expect(response).to have_http_status(:forbidden)
        expect(JSON.parse(response.body)["error"]).to match(/admin/i)
      end

      it "does not soft-delete the user" do
        delete "/api/v1/users/#{another_user.id}", headers: user_headers

        expect(another_user.reload.deleted_at).to be_nil
      end
    end

    context "authentication" do
      it "returns 401 without a token" do
        delete "/api/v1/users/#{another_user.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
