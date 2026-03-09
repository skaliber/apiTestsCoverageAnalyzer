# frozen_string_literal: true

class User < ApplicationRecord
  has_secure_password

  belongs_to :role, optional: true
  has_many :subscriptions, dependent: :nullify
  has_many :invoices, through: :subscriptions
  has_many :audit_logs
  has_many :seats

  validates :email, presence: true, uniqueness: { case_sensitive: false }, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :first_name, presence: true
  validates :last_name, presence: true
  validates :password, length: { minimum: 8 }, allow_nil: true

  before_save :downcase_email
  before_destroy :prevent_destroy

  scope :active, -> { where(deleted_at: nil) }
  scope :with_role, ->(role_name) { joins(:role).where(roles: { name: role_name }) }

  enum status: { pending: 0, active: 1, suspended: 2 }

  def admin?
    role&.name == "admin"
  end

  def active?
    deleted_at.nil? && (status == "active" || status.nil?)
  end

  def active_subscription
    subscriptions.active.order(created_at: :desc).first
  end

  def soft_delete!
    update!(deleted_at: Time.current)
    subscriptions.active.each { |s| s.cancel!(immediate: false) }
  end

  def full_name
    "#{first_name} #{last_name}".strip
  end

  def display_name
    full_name.presence || email
  end

  private

  def downcase_email
    self.email = email.downcase.strip
  end

  def prevent_destroy
    raise ActiveRecord::ReadOnlyRecord, "Users cannot be hard deleted. Use soft_delete! instead."
  end
end
