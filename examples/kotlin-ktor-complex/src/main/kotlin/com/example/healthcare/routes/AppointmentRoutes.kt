package com.example.healthcare.routes

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.model.*
import com.example.healthcare.repository.PatientRepository
import com.example.healthcare.service.AppointmentService
import com.example.healthcare.service.NotificationService
import com.example.healthcare.service.PatientService.ServiceResult
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.appointmentRoutes(
    appointmentService: AppointmentService,
    notificationService: NotificationService,
    patientRepository: PatientRepository
) {

    route(ApiPaths.APPOINTMENTS) {
        // GET /appointments - list appointments with filters
        get {
            val page = call.request.queryParameters["page"]?.toIntOrNull() ?: 1
            val pageSize = call.request.queryParameters["pageSize"]?.toIntOrNull() ?: 20
            val patientId = call.request.queryParameters["patientId"]
            val doctorId = call.request.queryParameters["doctorId"]
            val statusParam = call.request.queryParameters["status"]

            val status = if (statusParam != null) {
                try { AppointmentStatus.valueOf(statusParam.uppercase()) }
                catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_STATUS",
                        "Invalid status: $statusParam. Valid values: ${AppointmentStatus.entries.joinToString()}"))
                    return@get
                }
            } else null

            val result = appointmentService.getAppointments(page, pageSize, patientId, doctorId, status)
            call.respond(HttpStatusCode.OK, PaginatedResponse(
                items = result.items,
                totalCount = result.totalCount,
                page = result.page,
                pageSize = result.pageSize,
                totalPages = result.totalPages
            ))
        }

        // POST /appointments - book a new appointment
        post {
            val request = try {
                call.receive<CreateAppointmentRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
                return@post
            }

            when (val result = appointmentService.createAppointment(request)) {
                is ServiceResult.Success -> {
                    // Send confirmation notification
                    val patient = patientRepository.findById(result.data.patientId)
                    if (patient != null) {
                        notificationService.sendAppointmentConfirmation(patient, result.data)
                    }
                    call.respond(HttpStatusCode.Created, result.data)
                }
                is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
                is ServiceResult.Conflict -> call.respond(HttpStatusCode.Conflict, ApiError("CONFLICT", result.message))
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                is ServiceResult.Forbidden -> call.respond(HttpStatusCode.Forbidden, ApiError("FORBIDDEN", result.message))
            }
        }
    }

    route(ApiPaths.APPOINTMENT) {
        // GET /appointments/{id} - get a specific appointment
        get {
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Appointment ID is required"))

            when (val result = appointmentService.getAppointment(id)) {
                is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                else -> call.respond(HttpStatusCode.InternalServerError, ApiError("SERVER_ERROR", "Unexpected error"))
            }
        }

        // PUT /appointments/{id} - update an appointment
        put {
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Appointment ID is required"))

            val request = try {
                call.receive<UpdateAppointmentRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
                return@put
            }

            when (val result = appointmentService.updateAppointment(id, request)) {
                is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
                is ServiceResult.Conflict -> call.respond(HttpStatusCode.Conflict, ApiError("CONFLICT", result.message))
                is ServiceResult.Forbidden -> call.respond(HttpStatusCode.Forbidden, ApiError("FORBIDDEN", result.message))
            }
        }

        // DELETE /appointments/{id} - cancel an appointment
        delete {
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Appointment ID is required"))

            val reason = call.request.queryParameters["reason"] ?: "Cancelled by user"

            when (val result = appointmentService.cancelAppointment(id, reason)) {
                is ServiceResult.Success -> {
                    val patient = patientRepository.findById(result.data.patientId)
                    if (patient != null) {
                        notificationService.sendCancellationNotice(patient, result.data, result.data.cancellationFee)
                    }
                    call.respond(HttpStatusCode.OK, result.data)
                }
                is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
                is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
                else -> call.respond(HttpStatusCode.InternalServerError, ApiError("SERVER_ERROR", "Unexpected error"))
            }
        }
    }

    // POST /appointments/{id}/check-in
    post(ApiPaths.APPOINTMENT_CHECKIN) {
        val id = call.parameters["id"]
            ?: return@post call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Appointment ID is required"))

        val request = try {
            call.receive<CheckInRequest>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
            return@post
        }

        when (val result = appointmentService.checkInAppointment(id, request)) {
            is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
            is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
            is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
            else -> call.respond(HttpStatusCode.InternalServerError, ApiError("SERVER_ERROR", "Unexpected error"))
        }
    }

    // POST /appointments/{id}/complete
    post(ApiPaths.APPOINTMENT_COMPLETE) {
        val id = call.parameters["id"]
            ?: return@post call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Appointment ID is required"))

        val request = try {
            call.receive<CompleteAppointmentRequest>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
            return@post
        }

        when (val result = appointmentService.completeAppointment(id, request)) {
            is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
            is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
            is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
            else -> call.respond(HttpStatusCode.InternalServerError, ApiError("SERVER_ERROR", "Unexpected error"))
        }
    }
}
