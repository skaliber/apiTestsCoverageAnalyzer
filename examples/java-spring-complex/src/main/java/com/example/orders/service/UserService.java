package com.example.orders.service;

import com.example.orders.model.User;
import com.example.orders.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User createUser(User user) {
        if (userRepository.existsByEmail(user.getEmail())) {
            throw new IllegalArgumentException("Email already in use: " + user.getEmail());
        }
        user.setPasswordHash(passwordEncoder.encode(user.getPasswordHash()));
        return userRepository.save(user);
    }

    @Transactional(readOnly = true)
    public List<User> getAllUsers(int page, int size, String email) {
        if (email != null && !email.isEmpty()) {
            return userRepository.findByEmailContainingIgnoreCase(email);
        }
        return userRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    @Transactional(readOnly = true)
    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    public Optional<User> updateUser(Long id, User userDetails) {
        return userRepository.findById(id).map(existing -> {
            if (userDetails.getName() != null) {
                existing.setName(userDetails.getName());
            }
            if (userDetails.getEmail() != null && !userDetails.getEmail().equals(existing.getEmail())) {
                if (userRepository.existsByEmail(userDetails.getEmail())) {
                    throw new IllegalArgumentException("Email already in use");
                }
                existing.setEmail(userDetails.getEmail());
            }
            if (userDetails.getPasswordHash() != null && !userDetails.getPasswordHash().isBlank()) {
                existing.setPasswordHash(passwordEncoder.encode(userDetails.getPasswordHash()));
            }
            return userRepository.save(existing);
        });
    }

    public boolean deleteUser(Long id) {
        // Business rule: user-deletion-requires-admin (enforced at controller layer via @PreAuthorize)
        return userRepository.findById(id).map(user -> {
            userRepository.delete(user);
            return true;
        }).orElse(false);
    }
}
