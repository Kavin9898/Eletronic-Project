pipeline {
    agent any

    environment {
        AWS_DEFAULT_REGION = "ap-south-1"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Terraform Init') {
            steps {
                dir('terraform') {
                    sh 'terraform init'
                }
            }
        }

        stage('Terraform Validate') {
            steps {
                dir('terraform') {
                    sh 'terraform validate'
                }
            }
        }

        stage('Terraform Plan') {
            steps {
                withCredentials([string(credentialsId: '@(kavin89)@', variable: 'DB_PASSWORD')]) {
                    dir('terraform') {
                        sh """
                        terraform plan \
                        -var="db_username=admin" \
                        -var="db_password=${DB_PASSWORD}"
                        """
                    }
                }
            }
        }

        stage('Terraform Apply') {
            steps {
                withCredentials([string(credentialsId: '@(kavin89)@', variable: 'DB_PASSWORD')]) {
                    dir('terraform') {
                        sh """
                        terraform apply -auto-approve \
                        -var="db_username=admin" \
                        -var="db_password=${DB_PASSWORD}"
                        """
                    }
                }
            }
        }
    }
}
