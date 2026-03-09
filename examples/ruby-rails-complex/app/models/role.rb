# frozen_string_literal: true

class Role < ApplicationRecord
  has_many :users

  SYSTEM_ROLES = %w[admin member viewer].freeze

  validates :name, presence: true, uniqueness: { case_sensitive: false }

  def system_role?
    SYSTEM_ROLES.include?(name.downcase)
  end
end
