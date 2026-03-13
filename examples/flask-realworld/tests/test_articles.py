import pytest
from webtest import TestApp
from app import create_app
import factory

class ArticleFactory(factory.Factory):
    class Meta:
        model = dict
    title = factory.Faker('sentence')
    description = factory.Faker('paragraph')
    body = factory.Faker('text')

@pytest.fixture
def testapp():
    app = create_app()
    return TestApp(app)

def test_list_articles(testapp):
    response = testapp.get('/api/articles/')
    assert response.status_code == 200

def test_create_article(testapp):
    article = ArticleFactory()
    response = testapp.post_json('/api/articles/', article)
    assert response.status_code == 201

def test_get_article(testapp):
    response = testapp.get('/api/articles/test-slug')
    assert response.status_code == 200

def test_update_article(testapp):
    response = testapp.put_json('/api/articles/test-slug', {'title': 'Updated'})
    assert response.status_code == 200

def test_delete_article(testapp):
    response = testapp.delete('/api/articles/test-slug')
    assert response.status_code == 200

def test_favorite_article(testapp):
    response = testapp.post_json('/api/articles/test-slug/favorite', {})
    assert response.status_code == 200

def test_unfavorite_article(testapp):
    response = testapp.delete('/api/articles/test-slug/favorite')
    assert response.status_code == 200
