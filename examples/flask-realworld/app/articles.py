from flask import Blueprint
from flask_jwt_extended import jwt_required, jwt_optional
from flask_apispec import use_kwargs, marshal_with
from marshmallow import Schema, fields

articles_bp = Blueprint('articles', __name__)

class ArticleSchema(Schema):
    title = fields.String(required=True)
    description = fields.String()
    body = fields.String(required=True)
    slug = fields.String(dump_only=True)

class ArticleFilterSchema(Schema):
    tag = fields.String()
    author = fields.String()
    favorited = fields.String()
    limit = fields.Integer(missing=20)
    offset = fields.Integer(missing=0)

@articles_bp.route('/', methods=['GET'])
@jwt_optional
@use_kwargs(ArticleFilterSchema, location='query')
@marshal_with(ArticleSchema(many=True))
def get_articles(**kwargs):
    """List articles with optional filtering."""
    pass

@articles_bp.route('/', methods=['POST'])
@jwt_required
@use_kwargs(ArticleSchema)
@marshal_with(ArticleSchema, code=201)
def create_article(**kwargs):
    """Create a new article."""
    pass

@articles_bp.route('/<slug>', methods=['GET'])
@jwt_optional
@marshal_with(ArticleSchema)
def get_article(slug):
    """Get a single article by slug."""
    pass

@articles_bp.route('/<slug>', methods=['PUT'])
@jwt_required
@use_kwargs(ArticleSchema)
@marshal_with(ArticleSchema)
def update_article(slug, **kwargs):
    """Update an article."""
    pass

@articles_bp.route('/<slug>', methods=['DELETE'])
@jwt_required
def delete_article(slug):
    """Delete an article."""
    pass

@articles_bp.route('/<slug>/comments', methods=['GET'])
@jwt_optional
def get_comments(slug):
    """Get comments for an article."""
    pass

@articles_bp.route('/<slug>/comments', methods=['POST'])
@jwt_required
def add_comment(slug):
    """Add a comment to an article."""
    pass

@articles_bp.route('/<slug>/favorite', methods=['POST'])
@jwt_required
def favorite_article(slug):
    """Favorite an article."""
    pass

@articles_bp.route('/<slug>/favorite', methods=['DELETE'])
@jwt_required
def unfavorite_article(slug):
    """Unfavorite an article."""
    pass
