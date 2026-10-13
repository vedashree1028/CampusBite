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

        stage('Prepare AWS Staging Archive') {
            steps {
                sh '''
                    set -eu
                    tar -czf campusbite-staging.tar.gz --exclude='./.env' --exclude='*.pem' --exclude='./.git' -C app .
                    test -s campusbite-staging.tar.gz
                    if tar -tzf campusbite-staging.tar.gz | grep -E '(^|/)(\.env|[^/]*\.pem)$'; then
                        echo "ERROR: Archive contains a secret file."
                        exit 1
                    fi
                    echo "Staging archive created without .env or PEM files."
                '''
            }
        }

        stage('Test AWS SSH Connection') {
            steps {
                sshagent(credentials: ['campusbite-aws-ssh']) {
                    sh '''
                        set -eu
                        ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 ubuntu@3.7.71.108 "echo AWS SSH connection successful"
                    '''
                }
            }
        }

        stage('Build AWS Candidate with Ansible') {
            steps {
                sshagent(credentials: ['campusbite-aws-ssh']) {
                    sh '''
                        set -eu
                        export ANSIBLE_SSH_COMMON_ARGS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
                        ansible-playbook \
                            -i ansible/inventory.ini \
                            ansible/deploy.yml

                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'CampusBite CI passed and the AWS candidate build ran through Ansible.'
        }

        failure {
            echo 'Pipeline failed. Check the stage logs.'
        }

        always {
            echo 'CampusBite CI pipeline finished.'
        }
    }
}
