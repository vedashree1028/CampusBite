
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'CampusBite source code is available in the workspace.'
            }
        }

        stage('Check Project Files') {
            steps {
                sh '''
                    set -eu
                    test -f app/package.json
                    test -f app/package-lock.json
                    test -f app/server.js
                    test -f app/Dockerfile
                    test -f app/public/index.html
                    test -f app/public/app.js
                    test -f app/public/style.css
                    test -f app/test/project.test.js
                    echo "All required files exist."
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                dir('app') {
                    sh 'npm ci'
                }
            }
        }

        stage('Automated Tests') {
            steps {
                dir('app') {
                    sh 'npm test'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build -t campusbite:${BUILD_NUMBER} ./app'
            }
        }
    }

    post {
        success {
            echo 'CampusBite tests passed and Docker image built successfully.'
        }

        failure {
            echo 'Pipeline failed. Check the stage logs.'
        }

        always {
            echo 'CampusBite CI pipeline finished.'
        }
    }
}

