package com.example.healthcare.routes

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.model.*
import com.example.healthcare.service.PatientService
import com.example.healthcare.service.PatientService.ServiceResult
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

@Serializable
data class ApiError(val code: String, val message: String, val details: String? = null)

@Serializable
data class PaginatedResponse<T>(
    val items: List<T>,
    val totalCount: Int,
    val page: Int,
    val pageSize: Int,
    val totalPages: Int
)

fun Route.patientRoutes(patientService: PatientService) {

    route(ApiPaths.PATIENTS) {
        // GET /patients - list all patients with pagination and search
        get {
            val page = call.request.queryParameters["page"]?.toIntOrNull() ?: 1
            val pageSize = call.request.queryParameters["pageSize"]?.toIntOrNull() ?: 20
            val search = call.request.queryParameters["search"]

            if (page < 1) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_PAGE", "Page must be >= 1"))
                return@get
            }
            if (pageSize !in 1..100) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_PAGE_SIZE", "Page size must be between 1 and 100"))
                return@get
            }

            val result = patientService.getPatients(page, pageSize, search)
            call.respond(HttpStatusCode.OK, PaginatedResponse(
                items = result.items,
                totalCount = result.totalCount,
                page = result.page,
                pageSize = result.pageSize,
                totalPages = result.totalPages
            ))
        }

        // POST /patients - create a new patient
        post {
            val request = try {
                call.receive<CreatePatientRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
                return@post
            }

            when (val result = patientService.createPatient(request)) {
                is ServiceResult.Success -> call.respond(HttpStatusCode.Created, result.data)
                is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
                is ServiceResult.Conflict -> call.respond(HttpStatusCode.Conflict, ApiError("CONFLICT", result.message))
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                is ServiceResult.Forbidden -> call.respond(HttpStatusCode.Forbidden, ApiError("FORBIDDEN", result.message))
            }
        }
    }

    route(ApiPaths.PATIENT) {
        // GET /patients/{id} - get a specific patient
        get {
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Patient ID is required"))
            val requestingUserId = call.request.headers["X-User-Id"]

            when (val result = patientService.getPatient(id, requestingUserId)) {
                is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                is ServiceResult.Forbidden -> call.respond(HttpStatusCode.Forbidden, ApiError("FORBIDDEN", result.message))
                else -> call.respond(HttpStatusCode.InternalServerError, ApiError("SERVER_ERROR", "Unexpected error"))
            }
        }

        // PUT /patients/{id} - update a patient
        put {
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Patient ID is required"))

            val request = try {
                call.receive<UpdatePatientRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
                return@put
            }

            when (val result = patientService.updatePatient(id, request)) {
                is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
                is ServiceResult.Conflict -> call.respond(HttpStatusCode.Conflict, ApiError("CONFLICT", result.message))
                is ServiceResult.Forbidden -> call.respond(HttpStatusCode.Forbidden, ApiError("FORBIDDEN", result.message))
            }
        }

        // DELETE /patients/{id} - soft-delete a patient
        delete {
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Patient ID is required"))

            when (val result = patientService.deletePatient(id)) {
                is ServiceResult.Success -> call.respond(HttpStatusCode.NoContent)
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                else -> call.respond(HttpStatusCode.InternalServerError, ApiError("SERVER_ERROR", "Unexpected error"))
            }
        }
    }
}
