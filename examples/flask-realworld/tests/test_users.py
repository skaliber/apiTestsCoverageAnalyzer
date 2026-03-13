import pytest
from webtest import TestApp
from app import create_app

@pytest.fixture
def testapp():
    app = create_app()
    return TestApp(app)

def test_register_user(testapp):
    response = testapp.post_json('/api/users/', {
        'email': 'test@example.com',
        'username': 'testuser',
        'password': 'secret123'
    })
    assert response.status_code == 201

def test_login(testapp):
    response = testapp.post_json('/api/users/login', {
        'email': 'test@example.com',
        'password': 'secret123'
    })
    assert response.status_code == 200

def test_get_current_user(testapp):
    response = testapp.get('/api/users/me')
    assert response.status_code == 200

def test_update_user(testapp):
    response = testapp.put_json('/api/users/me', {'bio': 'Updated bio'})
    assert response.status_code == 200
