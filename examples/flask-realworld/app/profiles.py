from flask import Blueprint
from flask_jwt_extended import jwt_required, jwt_optional
from flask_apispec import marshal_with
from marshmallow import Schema, fields

profiles_bp = Blueprint('profiles', __name__)

class ProfileSchema(Schema):
    username = fields.String()
    bio = fields.String()
    image = fields.Url()
    following = fields.Boolean()

@profiles_bp.route('/<username>', methods=['GET'])
@jwt_optional
@marshal_with(ProfileSchema)
def get_profile(username):
    """Get a user's profile."""
    pass

@profiles_bp.route('/<username>/follow', methods=['POST'])
@jwt_required
def follow_user(username):
    """Follow a user."""
    pass

@profiles_bp.route('/<username>/follow', methods=['DELETE'])
@jwt_required
def unfollow_user(username):
    """Unfollow a user."""
    pass
