package com.example.conduit.adapter.web;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @PostMapping("/login")
    public Object login(@RequestBody Object credentials) {
        return null;
    }

    @PostMapping
    public Object register(@RequestBody Object user) {
        return null;
    }

    @GetMapping("/me")
    public Object getCurrentUser() {
        return null;
    }

    @PutMapping("/me")
    public Object updateUser(@RequestBody Object user) {
        return null;
    }
}
