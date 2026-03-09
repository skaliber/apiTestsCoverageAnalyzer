package com.example.healthcare.routes

import com.example.healthcare.helpers.ApiPaths
import com.example.healthcare.model.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.Instant
import java.time.LocalDate

// In-memory doctor store (would be a real repository/service in production)
private val doctors = listOf(
    Doctor(
        id = "doctor-001",
        name = "Dr. Emily Carter",
        specialization = Specialization.GENERAL_PRACTICE,
        licenseNumber = "MD-IL-12345",
        email = "emily.carter@hospital.com",
        phone = "555-1001",
        department = "Primary Care",
        yearsOfExperience = 15,
        education = listOf(
            Education("MD", "University of Illinois College of Medicine", 2008),
            Education("BS Biology", "Northwestern University", 2004)
        ),
        consultationFee = 150.0,
        rating = 4.8,
        createdAt = "2020-01-15T09:00:00Z",
        updatedAt = "2024-12-01T10:00:00Z"
    ),
    Doctor(
        id = "doctor-002",
        name = "Dr. James Okonkwo",
        specialization = Specialization.PULMONOLOGY,
        licenseNumber = "MD-IL-67890",
        email = "james.okonkwo@hospital.com",
        phone = "555-1002",
        department = "Respiratory Medicine",
        yearsOfExperience = 20,
        education = listOf(
            Education("MD", "Johns Hopkins School of Medicine", 2003),
            Education("Fellowship Pulmonology", "Mayo Clinic", 2007)
        ),
        consultationFee = 225.0,
        rating = 4.9,
        createdAt = "2020-01-15T09:00:00Z",
        updatedAt = "2024-12-01T10:00:00Z"
    ),
    Doctor(
        id = "doctor-003",
        name = "Dr. Priya Sharma",
        specialization = Specialization.ENDOCRINOLOGY,
        licenseNumber = "MD-IL-11223",
        email = "priya.sharma@hospital.com",
        phone = "555-1003",
        department = "Endocrinology",
        yearsOfExperience = 12,
        education = listOf(
            Education("MD", "Northwestern Feinberg School of Medicine", 2011),
            Education("Fellowship Endocrinology", "University of Chicago", 2015)
        ),
        consultationFee = 200.0,
        rating = 4.7,
        createdAt = "2020-03-01T09:00:00Z",
        updatedAt = "2024-11-15T10:00:00Z"
    ),
    Doctor(
        id = "doctor-004",
        name = "Dr. Marcus Webb",
        specialization = Specialization.CARDIOLOGY,
        licenseNumber = "MD-IL-44556",
        email = "marcus.webb@hospital.com",
        phone = "555-1004",
        department = "Cardiology",
        yearsOfExperience = 18,
        education = listOf(
            Education("MD", "Harvard Medical School", 2005),
            Education("Fellowship Cardiology", "Cleveland Clinic", 2009)
        ),
        consultationFee = 275.0,
        rating = 4.95,
        createdAt = "2020-01-15T09:00:00Z",
        updatedAt = "2024-12-01T10:00:00Z"
    )
)

fun Route.doctorRoutes() {

    // GET /doctors - list all doctors with optional filters
    get(ApiPaths.DOCTORS) {
        val specialization = call.request.queryParameters["specialization"]
        val acceptingPatients = call.request.queryParameters["acceptingPatients"]?.toBooleanStrictOrNull()
        val department = call.request.queryParameters["department"]

        var filtered = doctors.filter { it.isAcceptingPatients || acceptingPatients == false }

        if (specialization != null) {
            val spec = try { Specialization.valueOf(specialization.uppercase()) }
            catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_SPECIALIZATION",
                    "Invalid specialization: $specialization. Valid values: ${Specialization.entries.joinToString()}"))
                return@get
            }
            filtered = filtered.filter { it.specialization == spec }
        }

        if (acceptingPatients != null) {
            filtered = filtered.filter { it.isAcceptingPatients == acceptingPatients }
        }

        if (department != null) {
            filtered = filtered.filter { it.department.contains(department, ignoreCase = true) }
        }

        val summaries = filtered.map { doctor ->
            DoctorSummary(
                id = doctor.id,
                name = doctor.name,
                specialization = doctor.specialization,
                department = doctor.department,
                isAcceptingPatients = doctor.isAcceptingPatients,
                consultationFee = doctor.consultationFee,
                rating = doctor.rating
            )
        }
        call.respond(HttpStatusCode.OK, summaries)
    }

    // GET /doctors/{id} - get a specific doctor
    get(ApiPaths.DOCTOR) {
        val id = call.parameters["id"]
            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Doctor ID is required"))

        val doctor = doctors.find { it.id == id }
            ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", "Doctor with ID '$id' not found"))

        call.respond(HttpStatusCode.OK, doctor)
    }

    // GET /doctors/{id}/availability - get doctor availability
    get(ApiPaths.DOCTOR_AVAILABILITY) {
        val id = call.parameters["id"]
            ?: return@get call.respond(HttpStatusCode.BadRequest, ApiError("MISSING_ID", "Doctor ID is required"))

        val dateParam = call.request.queryParameters["date"]
        val requestedDate = if (dateParam != null) {
            try { LocalDate.parse(dateParam) }
            catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("INVALID_DATE", "Date must be in YYYY-MM-DD format"))
                return@get
            }
        } else {
            LocalDate.now().plusDays(1)
        }

        val doctor = doctors.find { it.id == id }
            ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("NOT_FOUND", "Doctor with ID '$id' not found"))

        // Generate sample availability slots (in production, consult actual schedule)
        val availableSlots = (9..16).map { hour ->
            TimeSlot(
                date = requestedDate.toString(),
                startTime = String.format("%02d:00", hour),
                endTime = String.format("%02d:30", hour),
                isAvailable = hour != 12 && hour != 13 // simulate lunch break unavailability
            )
        }.filter { it.isAvailable }

        val nextAvailable = if (availableSlots.isNotEmpty()) {
            "${requestedDate}T${availableSlots.first().startTime}:00Z"
        } else {
            null
        }

        call.respond(HttpStatusCode.OK, DoctorAvailability(
            doctorId = doctor.id,
            doctorName = doctor.name,
            availableSlots = availableSlots,
            nextAvailableDate = nextAvailable
        ))
    }
}
