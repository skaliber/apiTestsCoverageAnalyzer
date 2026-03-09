// Jenkins Declarative Pipeline — API Test Coverage Analysis
//
// All stages call Makefile targets.  No coverage logic is duplicated here.
// Pass/fail is governed exclusively by the analyzer's process exit code.
//
// Prerequisites:
//   - NodeJS tool named "node20" configured in Jenkins Global Tool Configuration
//   - GNU Make available on the build agent (install: sudo apt-get install make)
//   - HTML Publisher plugin  (for publishing HTML report)
//   - JUnit plugin           (built-in; for publishing threshold results)
//
// Reports written by the analyzer:
//   reports/build-summary.md             CI summary (Markdown)
//   reports/pr-summary.md                PR comment summary (Markdown)
//   reports/coverage-intelligence.json   Intelligence findings
//   reports/*-report.json                Per-metric JSON reports
//   reports/*-report.html                Per-metric HTML reports
//   reports/*-junit.xml                  Per-metric JUnit XML

pipeline {
    agent any

    tools {
        nodejs 'node20'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            steps {
                sh 'make install'
            }
        }

        stage('Build') {
            steps {
                sh 'make build'
            }
        }

        stage('Tests') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh 'make test-unit'
                    }
                }

                stage('Integration Tests') {
                    steps {
                        sh 'make test-integration'
                    }
                }
            }
        }

        stage('Self-Analysis (all metrics)') {
            // The analyzer exits non-zero automatically when thresholds are breached.
            // No shell logic is needed to determine pass/fail.
            steps {
                sh 'make self-analysis-all'
            }
        }

        stage('Generate Summaries') {
            steps {
                sh 'make summary'
                sh 'make build-summary'
            }
        }
    }

    post {
        always {
            // Publish HTML coverage report (requires HTML Publisher plugin)
            publishHTML(target: [
                allowMissing         : true,
                alwaysLinkToLastBuild: true,
                keepAll              : true,
                reportDir            : 'reports',
                reportFiles          : 'endpoint-report.html',
                reportName           : 'API Coverage Report'
            ])

            // Publish build summary
            publishHTML(target: [
                allowMissing         : true,
                alwaysLinkToLastBuild: true,
                keepAll              : true,
                reportDir            : 'reports',
                reportFiles          : 'build-summary.md',
                reportName           : 'Build Summary'
            ])

            // Publish JUnit threshold results
            junit allowEmptyResults: true, testResults: 'reports/*-junit.xml'

            // Archive all reports
            archiveArtifacts artifacts: 'reports/**', fingerprint: true

            // Print build summary to console log
            script {
                if (fileExists('reports/build-summary.md')) {
                    echo readFile('reports/build-summary.md')
                }
            }
        }
    }
}
