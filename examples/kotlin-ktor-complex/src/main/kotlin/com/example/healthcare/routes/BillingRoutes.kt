package com.example.healthcare.routes

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.model.*
import com.example.healthcare.service.BillingService
import com.example.healthcare.service.PatientService.ServiceResult
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.billingRoutes(billingService: BillingService) {

    // POST /billing/invoices - create a new invoice
    post(ApiPaths.BILLING_INVOICES) {
        val request = try {
            call.receive<CreateInvoiceRequest>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
            return@post
        }

        when (val result = billingService.createInvoice(request)) {
            is ServiceResult.Success -> call.respond(HttpStatusCode.Created, result.data)
            is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
            is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
            is ServiceResult.Conflict -> call.respond(HttpStatusCode.Conflict, ApiError("CONFLICT", result.message))
            is ServiceResult.Forbidden -> call.respond(HttpStatusCode.Forbidden, ApiError("FORBIDDEN", result.message))
        }
    }

    // GET /billing/invoices/{id} - get a specific invoice
    get(ApiPaths.BILLING_INVOICE) {
        val id = call.parameters["id"]
            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Invoice ID is required"))

        when (val result = billingService.getInvoice(id)) {
            is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
            is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
            else -> call.respond(HttpStatusCode.InternalServerError, ApiError("SERVER_ERROR", "Unexpected error"))
        }
    }

    // POST /billing/invoices/{id}/pay - pay an invoice
    post(ApiPaths.BILLING_INVOICE_PAY) {
        val id = call.parameters["id"]
            ?: return@post call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Invoice ID is required"))

        val request = try {
            call.receive<PayInvoiceRequest>()
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_BODY", "Invalid request body: ${e.message}"))
            return@post
        }

        when (val result = billingService.payInvoice(id, request)) {
            is ServiceResult.Success -> call.respond(HttpStatusCode.OK, result.data)
            is ServiceResult.NotFound -> call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", result.message))
            is ServiceResult.ValidationError -> call.respond(HttpStatusCode.BadRequest, ApiError("VALIDATION_ERROR", result.message))
            is ServiceResult.Conflict -> call.respond(HttpStatusCode.Conflict, ApiError("CONFLICT", result.message))
            is ServiceResult.Forbidden -> call.respond(HttpStatusCode.Forbidden, ApiError("FORBIDDEN", result.message))
        }
    }
}
