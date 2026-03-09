# frozen_string_literal: true

require "rails_helper"

# COMPLETE COVERAGE SPEC - Coupons
# Covers: validate - including business rule: coupon-single-use

RSpec.describe "Coupons API - Complete Coverage", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }
  let(:auth_headers) { auth_headers_for(user) }
  let(:other_headers) { auth_headers_for(other_user) }

  describe "POST /api/v1/coupons/validate" do
    context "with a valid active coupon" do
      let(:coupon) { create(:coupon, :active, discount_type: "percentage", discount_value: 20) }

      it "returns coupon details when valid" do
        post "/api/v1/coupons/validate",
             params: { code: coupon.code },
             headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["code"]).to eq(coupon.code)
        expect(json["data"]["discount_type"]).to eq("percentage")
        expect(json["data"]["discount_value"]).to eq(20)
        expect(json["data"]["valid"]).to eq(true)
      end
    end

    context "with a fixed discount coupon" do
      let(:coupon) { create(:coupon, :active, discount_type: "fixed", discount_value: 50) }

      it "returns correct discount info" do
        post "/api/v1/coupons/validate",
             params: { code: coupon.code },
             headers: auth_headers

        expect(response).to have_http_status(:ok)
        json = JSON.parse(response.body)
        expect(json["data"]["discount_type"]).to eq("fixed")
        expect(json["data"]["discount_value"]).to eq(50)
      end
    end

    context "with a non-existent coupon" do
      it "returns 404" do
        post "/api/v1/coupons/validate",
             params: { code: "DOESNOTEXIST" },
             headers: auth_headers

        expect(response).to have_http_status(:not_found)
      end
    end

    context "with an expired coupon" do
      let(:expired_coupon) { create(:coupon, :expired) }

      it "returns 422 with expired message" do
        post "/api/v1/coupons/validate",
             params: { code: expired_coupon.code },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["error"]).to match(/expired|inactive/i)
      end
    end

    context "with single-use coupon (business rule: coupon-single-use)" do
      let(:single_use_coupon) { create(:coupon, :active, :single_use) }

      context "when coupon has not been used by this user" do
        it "returns valid" do
          post "/api/v1/coupons/validate",
               params: { code: single_use_coupon.code },
               headers: auth_headers

          expect(response).to have_http_status(:ok)
          expect(JSON.parse(response.body)["data"]["valid"]).to eq(true)
        end
      end

      context "when coupon has already been used by this user" do
        before do
          create(:coupon_redemption, coupon: single_use_coupon, user: user)
        end

        it "returns 422 with already used message" do
          post "/api/v1/coupons/validate",
               params: { code: single_use_coupon.code },
               headers: auth_headers

          expect(response).to have_http_status(:unprocessable_entity)
          expect(JSON.parse(response.body)["error"]).to match(/already been used/i)
        end
      end

      context "when coupon was used by a different user" do
        before do
          create(:coupon_redemption, coupon: single_use_coupon, user: other_user)
        end

        it "returns valid for the new user" do
          post "/api/v1/coupons/validate",
               params: { code: single_use_coupon.code },
               headers: auth_headers

          expect(response).to have_http_status(:ok)
        end
      end
    end

    context "with coupon at max redemption limit" do
      let(:coupon) { create(:coupon, :active, max_redemptions: 2) }

      before { create_list(:coupon_redemption, 2, coupon: coupon) }

      it "returns 422 when max redemptions reached" do
        post "/api/v1/coupons/validate",
             params: { code: coupon.code },
             headers: auth_headers

        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["error"]).to match(/redemption limit/i)
      end
    end

    context "authentication" do
      let(:coupon) { create(:coupon, :active) }

      it "returns 401 without a token" do
        post "/api/v1/coupons/validate", params: { code: coupon.code }

        expect(response).to have_http_status(:unauthorized)
      end
    end
  end
end
