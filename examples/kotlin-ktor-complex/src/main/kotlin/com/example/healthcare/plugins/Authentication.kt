package com.example.healthcare.plugins

import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm

fun Application.configureAuthentication() {
    val jwtSecret = environment.config.propertyOrNull("jwt.secret")?.getString() ?: "healthcare-secret-key"
    val jwtIssuer = environment.config.propertyOrNull("jwt.issuer")?.getString() ?: "healthcare-app"
    val jwtAudience = environment.config.propertyOrNull("jwt.audience")?.getString() ?: "healthcare-users"

    install(Authentication) {
        jwt("auth-jwt") {
            realm = "Healthcare App"
            verifier(
                JWT
                    .require(Algorithm.HMAC256(jwtSecret))
                    .withAudience(jwtAudience)
                    .withIssuer(jwtIssuer)
                    .build()
            )
            validate { credential ->
                if (credential.payload.audience.contains(jwtAudience)) {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
        }

        jwt("auth-admin") {
            realm = "Healthcare Admin"
            verifier(
                JWT
                    .require(Algorithm.HMAC256(jwtSecret))
                    .withAudience(jwtAudience)
                    .withIssuer(jwtIssuer)
                    .withClaim("role", "admin")
                    .build()
            )
            validate { credential ->
                val role = credential.payload.getClaim("role").asString()
                if (role == "admin") JWTPrincipal(credential.payload) else null
            }
        }
    }
}
