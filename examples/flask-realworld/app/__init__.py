from flask import Flask
from app.articles import articles_bp
from app.users import users_bp
from app.profiles import profiles_bp

def create_app():
    app = Flask(__name__)
    app.register_blueprint(articles_bp, url_prefix='/api/articles')
    app.register_blueprint(users_bp, url_prefix='/api/users')
    app.register_blueprint(profiles_bp, url_prefix='/api/profiles')
    return app
