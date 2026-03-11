package com.example.conduit.domain.repository;

import java.util.Optional;

public interface UserRepository {
    Optional<Object> findByUsername(String username);
    Optional<Object> findByEmail(String email);
    Object save(Object user);
    void deleteById(Long id);
}
