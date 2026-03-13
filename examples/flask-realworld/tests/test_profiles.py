import pytest
from webtest import TestApp
from app import create_app

@pytest.fixture
def testapp():
    app = create_app()
    return TestApp(app)

def test_get_profile(testapp):
    response = testapp.get('/api/profiles/janedoe')
    assert response.status_code == 200

def test_follow_user(testapp):
    response = testapp.post_json('/api/profiles/janedoe/follow', {})
    assert response.status_code == 200

def test_unfollow_user(testapp):
    response = testapp.delete('/api/profiles/janedoe/follow')
    assert response.status_code == 200
