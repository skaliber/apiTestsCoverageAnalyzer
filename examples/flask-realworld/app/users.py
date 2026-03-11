from flask import Blueprint
from flask_jwt_extended import jwt_required
from flask_apispec import use_kwargs, marshal_with
from marshmallow import Schema, fields

users_bp = Blueprint('users', __name__)

class UserSchema(Schema):
    email = fields.Email(required=True)
    username = fields.String(required=True)
    password = fields.String(load_only=True, required=True)
    bio = fields.String()
    image = fields.Url()

class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.String(required=True)

@users_bp.route('/login', methods=['POST'])
@use_kwargs(LoginSchema)
def login(**kwargs):
    """Authenticate user and return JWT token."""
    pass

@users_bp.route('/', methods=['POST'])
@use_kwargs(UserSchema)
@marshal_with(UserSchema, code=201)
def register(**kwargs):
    """Register a new user."""
    pass

@users_bp.route('/me', methods=['GET'])
@jwt_required
@marshal_with(UserSchema)
def get_current_user():
    """Get current user details."""
    pass

@users_bp.route('/me', methods=['PUT'])
@jwt_required
@use_kwargs(UserSchema)
@marshal_with(UserSchema)
def update_user(**kwargs):
    """Update current user."""
    pass
