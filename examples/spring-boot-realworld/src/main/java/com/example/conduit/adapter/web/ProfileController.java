package com.example.conduit.adapter.web;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profiles")
public class ProfileController {

    @GetMapping("/{username}")
    public Object getProfile(@PathVariable String username) {
        return null;
    }

    @PostMapping("/{username}/follow")
    public Object followUser(@PathVariable String username) {
        return null;
    }

    @DeleteMapping("/{username}/follow")
    public void unfollowUser(@PathVariable String username) {
    }
}
