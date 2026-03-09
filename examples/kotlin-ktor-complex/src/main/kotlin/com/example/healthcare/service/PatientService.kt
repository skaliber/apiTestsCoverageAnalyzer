package com.example.healthcare.service

import com.example.healthcare.model.*
import com.example.healthcare.repository.PatientRepository

class PatientService(private val repository: PatientRepository) {

    data class PagedResult<T>(
        val items: List<T>,
        val totalCount: Int,
        val page: Int,
        val pageSize: Int,
        val totalPages: Int
    )

    sealed class ServiceResult<out T> {
        data class Success<T>(val data: T) : ServiceResult<T>()
        data class NotFound(val message: String) : ServiceResult<Nothing>()
        data class Conflict(val message: String) : ServiceResult<Nothing>()
        data class ValidationError(val message: String) : ServiceResult<Nothing>()
        data class Forbidden(val message: String) : ServiceResult<Nothing>()
    }

    fun getPatients(page: Int, pageSize: Int, search: String? = null): PagedResult<PatientSummary> {
        val patients = repository.findAll(page, pageSize, search)
        val total = repository.count()
        val summaries = patients.map { patient ->
            PatientSummary(
                id = patient.id,
                name = patient.name,
                dateOfBirth = patient.dateOfBirth,
                email = patient.email,
                isActive = patient.isActive
            )
        }
        return PagedResult(
            items = summaries,
            totalCount = total,
            page = page,
            pageSize = pageSize,
            totalPages = (total + pageSize - 1) / pageSize
        )
    }

    fun getPatient(id: String, requestingUserId: String? = null): ServiceResult<Patient> {
        val patient = repository.findById(id)
            ?: return ServiceResult.NotFound("Patient with ID '$id' not found")

        // Business rule: patient-data-privacy
        // In a real application, check if requestingUserId is the patient or an authorized provider
        if (requestingUserId != null && requestingUserId != id && !isAuthorizedProvider(requestingUserId)) {
            return ServiceResult.Forbidden("Access to patient records is restricted")
        }

        return ServiceResult.Success(patient)
    }

    fun createPatient(request: CreatePatientRequest): ServiceResult<Patient> {
        // Validate required fields
        if (request.name.isBlank()) {
            return ServiceResult.ValidationError("Patient name is required")
        }
        if (request.email.isBlank() || !request.email.contains("@")) {
            return ServiceResult.ValidationError("Valid email address is required")
        }
        if (!isValidDateOfBirth(request.dateOfBirth)) {
            return ServiceResult.ValidationError("Invalid date of birth format. Use YYYY-MM-DD")
        }

        // Check for duplicate email
        val existingPatient = repository.findByEmail(request.email)
        if (existingPatient != null) {
            return ServiceResult.Conflict("A patient with email '${request.email}' already exists")
        }

        val patient = repository.save(request)
        return ServiceResult.Success(patient)
    }

    fun updatePatient(id: String, request: UpdatePatientRequest): ServiceResult<Patient> {
        repository.findById(id)
            ?: return ServiceResult.NotFound("Patient with ID '$id' not found")

        // Validate email if provided
        if (request.email != null && (request.email.isBlank() || !request.email.contains("@"))) {
            return ServiceResult.ValidationError("Valid email address is required")
        }

        // Check email uniqueness if changing email
        if (request.email != null) {
            val existingPatient = repository.findByEmail(request.email)
            if (existingPatient != null && existingPatient.id != id) {
                return ServiceResult.Conflict("Email '${request.email}' is already in use")
            }
        }

        val updated = repository.update(id, request)
            ?: return ServiceResult.NotFound("Patient with ID '$id' not found")
        return ServiceResult.Success(updated)
    }

    fun deletePatient(id: String): ServiceResult<Unit> {
        repository.findById(id)
            ?: return ServiceResult.NotFound("Patient with ID '$id' not found")

        repository.delete(id)
        return ServiceResult.Success(Unit)
    }

    private fun isValidDateOfBirth(dateOfBirth: String): Boolean {
        return dateOfBirth.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))
    }

    private fun isAuthorizedProvider(userId: String): Boolean {
        // Placeholder: in real implementation, check if userId is a doctor/admin in the system
        return userId.startsWith("doctor-") || userId.startsWith("admin-")
    }
}
