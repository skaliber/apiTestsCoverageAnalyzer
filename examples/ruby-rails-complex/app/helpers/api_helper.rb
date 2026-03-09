# frozen_string_literal: true

module ApiHelper
  def render_success(data, status: :ok, meta: nil)
    response = { data: data }
    response[:meta] = meta if meta
    render json: response, status: status
  end

  def render_error(message, status: :unprocessable_entity, errors: nil)
    response = { error: message }
    response[:errors] = errors if errors
    render json: response, status: status
  end

  def render_not_found(resource_name = "Resource")
    render json: { error: "#{resource_name} not found" }, status: :not_found
  end

  def render_forbidden(message = "Access denied")
    render json: { error: message }, status: :forbidden
  end

  def render_unauthorized
    render json: { error: "Unauthorized" }, status: :unauthorized
  end

  def paginate(collection, serializer: nil)
    {
      data: serializer ? collection.map { |item| serializer.call(item) } : collection,
      meta: {
        current_page: collection.current_page,
        total_pages: collection.total_pages,
        total_count: collection.total_count,
        per_page: collection.limit_value
      }
    }
  end

  def parse_date_range(from_param, to_param)
    from = from_param.present? ? Time.parse(from_param) : nil
    to = to_param.present? ? Time.parse(to_param) : nil
    [from, to]
  rescue ArgumentError
    render json: { error: "Invalid date format. Use ISO 8601 (e.g., 2024-01-01T00:00:00Z)" },
           status: :bad_request
    nil
  end

  def auth_headers_from_token(token)
    { "Authorization" => "Bearer #{token}", "Content-Type" => "application/json" }
  end
end
