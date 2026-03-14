{{/*
Expand the name of the chart.
*/}}
{{- define "authensor.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this.
If release name contains chart name it will be used as a full name.
*/}}
{{- define "authensor.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "authensor.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "authensor.labels" -}}
helm.sh/chart: {{ include "authensor.chart" . }}
{{ include "authensor.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "authensor.selectorLabels" -}}
app.kubernetes.io/name: {{ include "authensor.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Control plane labels
*/}}
{{- define "authensor.controlPlane.labels" -}}
{{ include "authensor.labels" . }}
app.kubernetes.io/component: control-plane
{{- end }}

{{/*
Control plane selector labels
*/}}
{{- define "authensor.controlPlane.selectorLabels" -}}
{{ include "authensor.selectorLabels" . }}
app.kubernetes.io/component: control-plane
{{- end }}

{{/*
MCP server labels
*/}}
{{- define "authensor.mcpServer.labels" -}}
{{ include "authensor.labels" . }}
app.kubernetes.io/component: mcp-server
{{- end }}

{{/*
MCP server selector labels
*/}}
{{- define "authensor.mcpServer.selectorLabels" -}}
{{ include "authensor.selectorLabels" . }}
app.kubernetes.io/component: mcp-server
{{- end }}

{{/*
Migration job labels
*/}}
{{- define "authensor.migration.labels" -}}
{{ include "authensor.labels" . }}
app.kubernetes.io/component: migration
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "authensor.serviceAccountName" -}}
{{- if .Values.controlPlane.serviceAccount.create }}
{{- default (include "authensor.fullname" .) .Values.controlPlane.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.controlPlane.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Secret name for Authensor credentials
*/}}
{{- define "authensor.secretName" -}}
{{- if .Values.existingSecret }}
{{- .Values.existingSecret }}
{{- else }}
{{- include "authensor.fullname" . }}
{{- end }}
{{- end }}

{{/*
ConfigMap name
*/}}
{{- define "authensor.configMapName" -}}
{{- include "authensor.fullname" . }}-config
{{- end }}

{{/*
Control plane image
*/}}
{{- define "authensor.controlPlane.image" -}}
{{- $tag := default .Chart.AppVersion .Values.controlPlane.image.tag -}}
{{- printf "%s:%s" .Values.controlPlane.image.repository $tag }}
{{- end }}

{{/*
MCP server image
*/}}
{{- define "authensor.mcpServer.image" -}}
{{- $tag := default .Chart.AppVersion .Values.mcpServer.image.tag -}}
{{- printf "%s:%s" .Values.mcpServer.image.repository $tag }}
{{- end }}

{{/*
Database URL construction.
If databaseUrl is set, use it directly. Otherwise, build from subchart values.
*/}}
{{- define "authensor.databaseUrl" -}}
{{- if .Values.databaseUrl }}
{{- .Values.databaseUrl }}
{{- else if .Values.postgresql.enabled }}
{{- $host := printf "%s-postgresql" .Release.Name -}}
{{- $port := "5432" -}}
{{- $user := .Values.postgresql.auth.username -}}
{{- $db := .Values.postgresql.auth.database -}}
{{- printf "postgres://%s:$(PGPASSWORD)@%s:%s/%s" $user $host $port $db }}
{{- else }}
{{- fail "Either databaseUrl, existingSecret, or postgresql.enabled must be configured" }}
{{- end }}
{{- end }}

{{/*
PostgreSQL password secret reference.
Returns the secret name and key for the PostgreSQL password.
*/}}
{{- define "authensor.postgresql.passwordSecretName" -}}
{{- if .Values.postgresql.auth.existingSecret }}
{{- .Values.postgresql.auth.existingSecret }}
{{- else }}
{{- printf "%s-postgresql" .Release.Name }}
{{- end }}
{{- end }}
