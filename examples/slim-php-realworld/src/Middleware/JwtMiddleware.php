<?php

namespace App\Middleware;

use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Psr\Http\Message\ResponseInterface as Response;

class JwtMiddleware
{
    public function __invoke(Request $request, Handler $handler): Response
    {
        $token = $request->getHeaderLine('Authorization');
        if (empty($token)) {
            throw new \Exception('Unauthorized', 401);
        }
        return $handler->handle($request);
    }
}
