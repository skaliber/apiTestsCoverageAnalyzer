# frozen_string_literal: true

Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      # Users
      resources :users, only: [:index, :create, :show, :update, :destroy]

      # Subscriptions with nested actions
      resources :subscriptions, only: [:create, :show, :update, :destroy] do
        member do
          get  :upgrade
          post :cancel
        end

        # Seats nested under subscriptions
        resources :seats, only: [:index, :create, :destroy]
      end

      # Invoices
      resources :invoices, only: [:index, :show] do
        member do
          post :pay
        end
      end

      # Usage
      scope :usage do
        get  ":subscription_id", to: "usage#show", as: :usage
        post "record",           to: "usage#record",  as: :usage_record
      end

      # Roles (admin only)
      resources :roles

      # Plans (read-only for regular users)
      resources :plans, only: [:index, :show]

      # Coupons
      scope :coupons do
        post "validate", to: "coupons#validate", as: :coupons_validate
      end

      # Audit Logs
      get "audit-logs", to: "audit_logs#index", as: :audit_logs

      # Webhooks
      post "webhooks", to: "webhooks#receive", as: :webhooks

      # Admin endpoints
      namespace :admin do
        get "health", to: "admin#health", as: :health
        get "stats",  to: "admin#stats",  as: :stats
      end
    end
  end
end
