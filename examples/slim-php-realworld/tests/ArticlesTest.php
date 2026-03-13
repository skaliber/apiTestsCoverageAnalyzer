<?php

use PHPUnit\Framework\TestCase;

class ArticlesTest extends TestCase
{
    public function testListArticles()
    {
        $response = $this->get('/api/articles');
        $this->assertEquals(200, $response->getStatusCode());
    }

    public function testCreateArticle()
    {
        $response = $this->post('/api/articles', ['title' => 'Test', 'body' => 'Body']);
        $this->assertEquals(201, $response->getStatusCode());
    }

    public function testGetArticle()
    {
        $response = $this->get('/api/articles/test-slug');
        $this->assertEquals(200, $response->getStatusCode());
    }

    public function testUpdateArticle()
    {
        $response = $this->put('/api/articles/test-slug', ['title' => 'Updated']);
        $this->assertEquals(200, $response->getStatusCode());
    }

    public function testDeleteArticle()
    {
        $response = $this->delete('/api/articles/test-slug');
        $this->assertEquals(200, $response->getStatusCode());
    }
}
