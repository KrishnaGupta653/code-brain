# Requirements Document: Code-Brain Agent Task Spec

## Introduction

This document specifies requirements for comprehensive enhancements to the code-brain project across five major capability areas: multi-modal parsing, token reduction, AI integration, performance and polish, and community launch. These enhancements will transform code-brain from a code-only analysis tool into a comprehensive codebase intelligence system supporting documents, images, videos, and advanced AI-powered workflows.

The system must maintain parsing determinism, ensure Python analytics never block indexing, route all graph mutations through SQLiteStorage, attach ProvenanceRecord to every node, and preserve the existing AI export shape without breaking changes.

## Glossary

- **System**: The code-brain codebase intelligence system
- **Parser**: A component that extracts structured data from files
- **Multi_Modal_Parser**: A parser that handles non-code files (PDF, images, video transcripts)
- **Token_Reducer**: A component that reduces token count in AI exports
- **MCP_Server**: Model Context Protocol server for AI assistant integration
- **Graph**: The knowledge graph of code entities and relationships
- **SQLiteStorage**: The persistent storage layer for the graph
- **ProvenanceRecord**: Metadata tracking the source and confidence of graph data
- **AI_Export**: A token-optimized export format for AI consumption
- **Semantic_Deduplicator**: A component that removes duplicate nodes using embeddings
- **Delta_Exporter**: A component that exports only changed nodes
- **Security_Hardener**: A component that protects against SSRF, XSS, and rate limit attacks
- **Call_Resolver**: A component that resolves function call relationships
- **3D_Graph_UI**: The interactive 3D visualization interface
- **Benchmark_Harness**: A testing framework that validates token reduction claims
- **Agentic_Chat**: An AI chat interface with tool use and streaming
- **Architecture_Detector**: A component that identifies architectural patterns
- **Graph_Embedder**: A component that generates embeddings with graph context
- **Incremental_Analyzer**: A component that updates analytics without full recompute

## Requirements

### PHASE 1: Multi-Modal Parsing (CRITICAL)

#### Requirement 1.1: PDF Parser

**User Story:** As a developer, I want to parse PDF files containing API documentation, architecture documents, and design specifications, so that I can include documentation context in the knowledge graph.

##### Acceptance Criteria

1. WHEN a PDF file is provided, THE PDF_Parser SHALL extract text content with page numbers
2. WHEN a PDF contains structured headings, THE PDF_Parser SHALL identify section hierarchy
3. WHEN a PDF contains code blocks, THE PDF_Parser SHALL preserve code formatting
4. THE PDF_Parser SHALL create doc nodes for each major section with ProvenanceRecord
5. THE PDF_Parser SHALL link doc nodes to related code symbols when references are detected
6. WHEN a PDF file is larger than 50MB, THE PDF_Parser SHALL reject the file with a descriptive error
7. THE PDF_Parser SHALL support PDF versions 1.4 through 2.0
8. WHEN PDF parsing fails, THE System SHALL log the error and continue indexing other files

#### Requirement 1.2: Image OCR Parser

**User Story:** As a developer, I want to parse PNG, JPG, and SVG images containing architecture diagrams, screenshots, and whiteboard photos, so that I can extract visual documentation into the knowledge graph.

##### Acceptance Criteria

1. WHEN a PNG, JPG, or SVG file is provided, THE Image_Parser SHALL extract text using OCR
2. WHEN an image contains diagram elements, THE Image_Parser SHALL identify component names
3. THE Image_Parser SHALL create doc nodes for extracted text with image file provenance
4. WHEN an image file is larger than 20MB, THE Image_Parser SHALL reject the file with a descriptive error
5. THE Image_Parser SHALL support PNG, JPG, JPEG, and SVG formats
6. WHEN OCR confidence is below 60%, THE Image_Parser SHALL mark the node with low confidence in ProvenanceRecord
7. THE Image_Parser SHALL link extracted component names to code symbols when matches are found
8. WHEN image parsing fails, THE System SHALL log the error and continue indexing other files

#### Requirement 1.3: Video Transcript Parser

**User Story:** As a developer, I want to parse WebVTT and SRT transcript files from Loom recordings, YouTube captions, and meeting transcripts, so that I can include spoken documentation in the knowledge graph.

##### Acceptance Criteria

1. WHEN a WebVTT or SRT file is provided, THE Transcript_Parser SHALL extract timestamped text segments
2. THE Transcript_Parser SHALL create doc nodes for each transcript segment with timestamp provenance
3. WHEN a transcript mentions code symbols, THE Transcript_Parser SHALL link to matching nodes
4. THE Transcript_Parser SHALL support WebVTT and SRT formats
5. WHEN a transcript file is larger than 10MB, THE Transcript_Parser SHALL reject the file with a descriptive error
6. THE Transcript_Parser SHALL preserve speaker labels when present in the transcript
7. WHEN transcript parsing fails, THE System SHALL log the error and continue indexing other files

#### Requirement 1.4: Security Hardening

**User Story:** As a security engineer, I want the system to protect against SSRF, XSS, and rate limit attacks, so that the system is safe for production deployment.

##### Acceptance Criteria

1. WHEN a file path is provided, THE System SHALL validate the path is within the project root
2. WHEN an HTTP request is made, THE System SHALL reject requests to private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
3. THE System SHALL set Content-Security-Policy headers on all HTTP responses
4. THE System SHALL set X-Content-Type-Options: nosniff on all HTTP responses
5. THE System SHALL set X-Frame-Options: DENY on all HTTP responses
6. WHEN more than 100 requests are received from a single IP within 60 seconds, THE System SHALL reject subsequent requests with HTTP 429
7. WHEN user-provided content is rendered in HTML, THE System SHALL sanitize the content to prevent XSS
8. THE System SHALL validate all file uploads against a whitelist of allowed extensions

### PHASE 2: Token Reduction (HIGH)

#### Requirement 2.1: Semantic Node Deduplication

**User Story:** As an AI engineer, I want to deduplicate semantically identical nodes using embeddings, so that I can achieve 40-60× token reduction in AI exports.

##### Acceptance Criteria

1. WHEN two nodes have embedding cosine similarity above 0.95, THE Semantic_Deduplicator SHALL merge them into a single node
2. THE Semantic_Deduplicator SHALL preserve all ProvenanceRecords from merged nodes
3. THE Semantic_Deduplicator SHALL update all edges to point to the canonical merged node
4. WHEN nodes are merged, THE System SHALL log the merge operation with node IDs
5. THE Semantic_Deduplicator SHALL compute embeddings for node name, fullName, and summary
6. WHEN embeddings are not available, THE Semantic_Deduplicator SHALL skip deduplication and log a warning
7. THE Semantic_Deduplicator SHALL process nodes in batches of 100 to avoid memory exhaustion

#### Requirement 2.2: Delta Exports

**User Story:** As an AI engineer, I want to export only changed nodes since the last export, so that I can minimize token usage for incremental updates.

##### Acceptance Criteria

1. WHEN an export is requested with a previous export fingerprint, THE Delta_Exporter SHALL emit only nodes that changed since that fingerprint
2. THE Delta_Exporter SHALL include nodes with updated summaries, metadata, or relationships
3. THE Delta_Exporter SHALL include a delta manifest listing added, modified, and removed node IDs
4. WHEN no previous fingerprint is provided, THE Delta_Exporter SHALL perform a full export
5. THE Delta_Exporter SHALL compute fingerprints using SHA-256 hash of node content
6. THE Delta_Exporter SHALL preserve the AI export shape for delta exports

#### Requirement 2.3: Token Benchmark Harness

**User Story:** As a developer, I want to validate token reduction claims with automated benchmarks, so that I can prove >71.5× reduction versus raw file dumps.

##### Acceptance Criteria

1. THE Benchmark_Harness SHALL measure token count for raw file dumps using tiktoken
2. THE Benchmark_Harness SHALL measure token count for AI exports using tiktoken
3. THE Benchmark_Harness SHALL compute reduction ratio as raw_tokens / export_tokens
4. WHEN the reduction ratio is below 71.5×, THE Benchmark_Harness SHALL fail the test
5. THE Benchmark_Harness SHALL test against at least 3 representative repositories
6. THE Benchmark_Harness SHALL output results in JSON format with repository name, raw tokens, export tokens, and reduction ratio
7. THE Benchmark_Harness SHALL run as part of the test suite

#### Requirement 2.4: YAML Parser

**User Story:** As a developer, I want to parse YAML configuration files, so that I can include config relationships in the knowledge graph.

##### Acceptance Criteria

1. WHEN a YAML file is provided, THE YAML_Parser SHALL parse the file into a structured tree
2. THE YAML_Parser SHALL create config nodes for top-level keys with ProvenanceRecord
3. WHEN a YAML value references an environment variable, THE YAML_Parser SHALL create a USES edge to the variable
4. THE YAML_Parser SHALL support YAML 1.2 specification
5. WHEN YAML parsing fails, THE System SHALL log the error and continue indexing other files
6. THE YAML_Parser SHALL detect common config patterns (database URLs, API keys, service endpoints)

#### Requirement 2.5: TOML Parser

**User Story:** As a developer, I want to parse TOML configuration files, so that I can include Rust and Python config relationships in the knowledge graph.

##### Acceptance Criteria

1. WHEN a TOML file is provided, THE TOML_Parser SHALL parse the file into a structured tree
2. THE TOML_Parser SHALL create config nodes for top-level sections with ProvenanceRecord
3. WHEN a TOML value references a dependency, THE TOML_Parser SHALL create a DEPENDS_ON edge
4. THE TOML_Parser SHALL support TOML 1.0 specification
5. WHEN TOML parsing fails, THE System SHALL log the error and continue indexing other files
6. THE TOML_Parser SHALL detect Cargo.toml and pyproject.toml patterns

#### Requirement 2.6: SQL Schema Parser

**User Story:** As a developer, I want to parse SQL schema files, so that I can include database structure in the knowledge graph.

##### Acceptance Criteria

1. WHEN a SQL file is provided, THE SQL_Parser SHALL extract CREATE TABLE statements
2. THE SQL_Parser SHALL create type nodes for each table with column definitions
3. THE SQL_Parser SHALL create REFERENCES edges for foreign key relationships
4. THE SQL_Parser SHALL support PostgreSQL, MySQL, and SQLite syntax
5. WHEN SQL parsing fails, THE System SHALL log the error and continue indexing other files
6. THE SQL_Parser SHALL extract CREATE INDEX and CREATE VIEW statements

### PHASE 3: AI Integration (HIGH)

#### Requirement 3.1: MCP Server Expansion

**User Story:** As an AI assistant developer, I want 20 MCP tools instead of 7, so that I can support advanced agentic workflows.

##### Acceptance Criteria

1. THE MCP_Server SHALL provide the explain_symbol tool that returns detailed symbol documentation
2. THE MCP_Server SHALL provide the suggest_refactor tool that identifies refactoring opportunities
3. THE MCP_Server SHALL provide the detect_antipatterns tool that finds code smells
4. THE MCP_Server SHALL provide the generate_tests tool that suggests test cases for a symbol
5. THE MCP_Server SHALL provide the find_similar tool that finds similar code patterns
6. THE MCP_Server SHALL provide the trace_dataflow tool that tracks data flow through the graph
7. THE MCP_Server SHALL provide the audit_security tool that identifies security vulnerabilities
8. THE MCP_Server SHALL provide the estimate_complexity tool that computes cyclomatic complexity
9. THE MCP_Server SHALL provide the summarize_pr tool that summarizes pull request changes
10. THE MCP_Server SHALL provide the onboard_new_dev tool that generates onboarding documentation
11. THE MCP_Server SHALL provide the find_owners tool that identifies code owners for a file
12. THE MCP_Server SHALL provide the predict_bug_risk tool that estimates bug probability
13. THE MCP_Server SHALL provide the natural_language_query tool that translates natural language to graph queries
14. THE MCP_Server SHALL maintain backward compatibility with existing 7 tools
15. WHEN a tool call fails, THE MCP_Server SHALL return a descriptive error message

#### Requirement 3.2: Agentic Chat

**User Story:** As a developer, I want an AI chat interface with tool use and streaming, so that I can interactively explore the codebase.

##### Acceptance Criteria

1. WHEN a user submits a chat message, THE Agentic_Chat SHALL retrieve relevant context using hybrid search
2. THE Agentic_Chat SHALL call MCP tools when the AI determines tool use is needed
3. THE Agentic_Chat SHALL stream responses token-by-token to the user
4. THE Agentic_Chat SHALL support Anthropic, OpenAI, and Ollama providers
5. WHEN tool calls are made, THE Agentic_Chat SHALL display tool names and arguments to the user
6. THE Agentic_Chat SHALL maintain conversation history for multi-turn interactions
7. WHEN the AI requests multiple tools, THE Agentic_Chat SHALL execute them in parallel when possible

#### Requirement 3.3: Architecture Pattern Detection

**User Story:** As a developer, I want the system to detect architectural patterns, so that I can understand high-level design decisions.

##### Acceptance Criteria

1. WHEN the graph contains MVC patterns, THE Architecture_Detector SHALL identify model, view, and controller nodes
2. WHEN the graph contains repository patterns, THE Architecture_Detector SHALL identify repository and entity nodes
3. WHEN the graph contains factory patterns, THE Architecture_Detector SHALL identify factory and product nodes
4. THE Architecture_Detector SHALL create pattern nodes with IMPLEMENTS edges to participating symbols
5. THE Architecture_Detector SHALL detect at least 10 common patterns (MVC, Repository, Factory, Singleton, Observer, Strategy, Adapter, Facade, Proxy, Decorator)
6. WHEN a pattern is detected, THE Architecture_Detector SHALL add pattern metadata to the knowledge index

#### Requirement 3.4: Graph-Aware Embeddings

**User Story:** As an AI engineer, I want embeddings that include graph context, so that I can improve semantic search accuracy.

##### Acceptance Criteria

1. WHEN generating embeddings for a node, THE Graph_Embedder SHALL include the node's incoming and outgoing edge types
2. THE Graph_Embedder SHALL include the names of directly connected nodes in the embedding context
3. THE Graph_Embedder SHALL include the node's module path and semantic role
4. WHEN a node has more than 10 connections, THE Graph_Embedder SHALL include only the top 10 by importance
5. THE Graph_Embedder SHALL generate embeddings in batches of 100 to optimize API usage
6. WHEN embeddings are regenerated, THE Graph_Embedder SHALL update only nodes with changed graph context

### PHASE 4: Performance and Polish (MEDIUM)

#### Requirement 4.1: Call Resolution Improvement

**User Story:** As a developer, I want 90%+ call resolution accuracy, so that I can trust the call graph for refactoring decisions.

##### Acceptance Criteria

1. THE Call_Resolver SHALL resolve method calls on imported objects using import alias tracking
2. THE Call_Resolver SHALL resolve chained method calls up to 3 levels deep
3. THE Call_Resolver SHALL resolve calls through dependency injection containers
4. WHEN call resolution improves from 80% to 90%, THE System SHALL pass the benchmark test
5. THE Call_Resolver SHALL create CALLS edges with resolvedViaImport metadata
6. THE Call_Resolver SHALL log unresolved calls with context for debugging

#### Requirement 4.2: 3D Graph UI Search

**User Story:** As a developer, I want to search the 3D graph UI, so that I can quickly find nodes of interest.

##### Acceptance Criteria

1. WHEN a user types in the search box, THE 3D_Graph_UI SHALL filter nodes by name in real-time
2. THE 3D_Graph_UI SHALL highlight matching nodes in the visualization
3. THE 3D_Graph_UI SHALL center the camera on the first matching node
4. WHEN multiple nodes match, THE 3D_Graph_UI SHALL display a list of matches
5. THE 3D_Graph_UI SHALL support fuzzy search with Levenshtein distance
6. THE 3D_Graph_UI SHALL search across node names, types, and file paths

#### Requirement 4.3: 3D Graph UI Export PNG

**User Story:** As a developer, I want to export the 3D graph as a PNG image, so that I can include it in documentation.

##### Acceptance Criteria

1. WHEN a user clicks the export button, THE 3D_Graph_UI SHALL render the current view to a PNG file
2. THE 3D_Graph_UI SHALL support export resolutions of 1920×1080, 2560×1440, and 3840×2160
3. THE 3D_Graph_UI SHALL preserve node colors and labels in the exported image
4. THE 3D_Graph_UI SHALL include a timestamp and project name in the exported filename
5. WHEN export fails, THE 3D_Graph_UI SHALL display an error message to the user

#### Requirement 4.4: 3D Graph UI Hover Details

**User Story:** As a developer, I want to see node details on hover, so that I can inspect nodes without clicking.

##### Acceptance Criteria

1. WHEN a user hovers over a node, THE 3D_Graph_UI SHALL display a tooltip with node name, type, and file path
2. THE 3D_Graph_UI SHALL display the tooltip within 200ms of hover
3. THE 3D_Graph_UI SHALL hide the tooltip when the user moves the mouse away
4. THE 3D_Graph_UI SHALL display edge type when hovering over an edge
5. THE 3D_Graph_UI SHALL limit tooltip text to 200 characters

#### Requirement 4.5: 3D Graph UI Color Modes

**User Story:** As a developer, I want to switch between color modes, so that I can visualize different aspects of the graph.

##### Acceptance Criteria

1. THE 3D_Graph_UI SHALL support color-by-type mode that colors nodes by NodeType
2. THE 3D_Graph_UI SHALL support color-by-importance mode that colors nodes by importance score
3. THE 3D_Graph_UI SHALL support color-by-community mode that colors nodes by community ID
4. THE 3D_Graph_UI SHALL support color-by-file mode that colors nodes by file path
5. WHEN a user switches color modes, THE 3D_Graph_UI SHALL update node colors within 500ms

#### Requirement 4.6: 3D Graph UI Focus Mode

**User Story:** As a developer, I want to focus on a subgraph, so that I can reduce visual clutter.

##### Acceptance Criteria

1. WHEN a user selects a node and activates focus mode, THE 3D_Graph_UI SHALL hide nodes more than 2 hops away
2. THE 3D_Graph_UI SHALL fade out hidden nodes instead of removing them
3. WHEN a user deactivates focus mode, THE 3D_Graph_UI SHALL restore all nodes
4. THE 3D_Graph_UI SHALL allow adjusting focus depth from 1 to 5 hops

#### Requirement 4.7: 3D Graph UI Minimap

**User Story:** As a developer, I want a minimap, so that I can navigate large graphs easily.

##### Acceptance Criteria

1. THE 3D_Graph_UI SHALL display a minimap in the bottom-right corner
2. THE 3D_Graph_UI SHALL show the current viewport as a rectangle on the minimap
3. WHEN a user clicks on the minimap, THE 3D_Graph_UI SHALL move the camera to that location
4. THE 3D_Graph_UI SHALL update the minimap viewport rectangle when the camera moves
5. THE 3D_Graph_UI SHALL allow toggling minimap visibility

#### Requirement 4.8: Incremental Analytics

**User Story:** As a developer, I want analytics to update incrementally, so that I can avoid full recompute on small changes.

##### Acceptance Criteria

1. WHEN fewer than 10% of nodes change, THE Incremental_Analyzer SHALL update only affected nodes
2. THE Incremental_Analyzer SHALL recompute PageRank for changed nodes and their 2-hop neighborhood
3. THE Incremental_Analyzer SHALL recompute community assignments only for changed modules
4. WHEN more than 10% of nodes change, THE Incremental_Analyzer SHALL perform a full recompute
5. THE Incremental_Analyzer SHALL complete incremental updates within 2 seconds for graphs under 10,000 nodes

#### Requirement 4.9: Configuration Improvements

**User Story:** As a developer, I want to configure multi-modal parsing, security, and export settings, so that I can customize the system for my project.

##### Acceptance Criteria

1. THE System SHALL support a multiModal config section with enabled, maxPdfSize, maxImageSize, and maxTranscriptSize fields
2. THE System SHALL support a security config section with enableRateLimit, rateLimitRequests, and rateLimitWindow fields
3. THE System SHALL support an export config section with enableDeltaExport, enableSemanticDedup, and dedupThreshold fields
4. WHEN a config file is invalid, THE System SHALL reject the config with a descriptive error
5. THE System SHALL validate config values against allowed ranges
6. THE System SHALL provide a .codebrainrc.example.json with all available options

### PHASE 5: Community Launch (MEDIUM)

#### Requirement 5.1: Benchmark Documentation

**User Story:** As a potential user, I want to see benchmark results, so that I can evaluate the system's performance claims.

##### Acceptance Criteria

1. THE System SHALL provide a BENCHMARKS.md document with token reduction results
2. THE BENCHMARKS.md SHALL include results for at least 3 representative repositories
3. THE BENCHMARKS.md SHALL include raw token counts, export token counts, and reduction ratios
4. THE BENCHMARKS.md SHALL include call resolution accuracy percentages
5. THE BENCHMARKS.md SHALL include parsing speed benchmarks in files per second
6. THE BENCHMARKS.md SHALL include graph size limits tested (up to 100,000 nodes)

#### Requirement 5.2: One-Line Install

**User Story:** As a new user, I want to install the system with one command, so that I can get started quickly.

##### Acceptance Criteria

1. THE System SHALL provide an install script that runs with `curl -sSL https://install.code-brain.dev | sh`
2. THE install script SHALL detect the operating system (Linux, macOS, Windows)
3. THE install script SHALL install Node.js dependencies automatically
4. THE install script SHALL install Python dependencies if Python is available
5. THE install script SHALL add the code-brain binary to the system PATH
6. WHEN installation completes, THE install script SHALL display a success message with next steps

#### Requirement 5.3: README Overhaul

**User Story:** As a new user, I want a clear README, so that I can understand what the system does and how to use it.

##### Acceptance Criteria

1. THE README SHALL include a one-sentence description of the system
2. THE README SHALL include a features list with all major capabilities
3. THE README SHALL include a quick start section with 3-5 commands
4. THE README SHALL include a screenshot of the 3D graph UI
5. THE README SHALL include links to detailed documentation
6. THE README SHALL include a comparison table with similar tools
7. THE README SHALL include a roadmap section with planned features

## Parser and Serializer Requirements

### Requirement 6.1: PDF Parser with Pretty Printer

**User Story:** As a developer, I want to parse and print PDF content, so that I can verify parsing correctness.

##### Acceptance Criteria

1. WHEN a valid PDF file is provided, THE PDF_Parser SHALL parse it into a structured Document object
2. WHEN an invalid PDF file is provided, THE PDF_Parser SHALL return a descriptive error
3. THE PDF_Pretty_Printer SHALL format Document objects back into valid PDF files
4. FOR ALL valid Document objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)

### Requirement 6.2: YAML Parser with Pretty Printer

**User Story:** As a developer, I want to parse and print YAML content, so that I can verify parsing correctness.

##### Acceptance Criteria

1. WHEN a valid YAML file is provided, THE YAML_Parser SHALL parse it into a structured Config object
2. WHEN an invalid YAML file is provided, THE YAML_Parser SHALL return a descriptive error
3. THE YAML_Pretty_Printer SHALL format Config objects back into valid YAML files
4. FOR ALL valid Config objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)

### Requirement 6.3: TOML Parser with Pretty Printer

**User Story:** As a developer, I want to parse and print TOML content, so that I can verify parsing correctness.

##### Acceptance Criteria

1. WHEN a valid TOML file is provided, THE TOML_Parser SHALL parse it into a structured Config object
2. WHEN an invalid TOML file is provided, THE TOML_Parser SHALL return a descriptive error
3. THE TOML_Pretty_Printer SHALL format Config objects back into valid TOML files
4. FOR ALL valid Config objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)

### Requirement 6.4: SQL Schema Parser with Pretty Printer

**User Story:** As a developer, I want to parse and print SQL schemas, so that I can verify parsing correctness.

##### Acceptance Criteria

1. WHEN a valid SQL schema file is provided, THE SQL_Parser SHALL parse it into a structured Schema object
2. WHEN an invalid SQL schema file is provided, THE SQL_Parser SHALL return a descriptive error
3. THE SQL_Pretty_Printer SHALL format Schema objects back into valid SQL files
4. FOR ALL valid Schema objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)

## System Constraints

### Requirement 7.1: Parsing Determinism

**User Story:** As a developer, I want parsing to be deterministic, so that I can trust the graph is reproducible.

##### Acceptance Criteria

1. WHEN the same file is parsed twice, THE System SHALL produce identical graph nodes
2. WHEN the same file is parsed twice, THE System SHALL produce identical graph edges
3. THE System SHALL use stable IDs based on file path, symbol name, and location
4. THE System SHALL sort nodes and edges consistently in exports

### Requirement 7.2: Python Analytics Non-Blocking

**User Story:** As a developer, I want Python analytics to never block indexing, so that the system remains responsive.

##### Acceptance Criteria

1. WHEN Python analytics fail, THE System SHALL continue indexing without analytics
2. WHEN Python analytics timeout after 30 seconds, THE System SHALL log a warning and continue
3. THE System SHALL provide fallback analytics using JavaScript when Python is unavailable
4. THE System SHALL display a warning in the UI when analytics are unavailable

### Requirement 7.3: Graph Mutations Through SQLiteStorage

**User Story:** As a developer, I want all graph mutations to go through SQLiteStorage, so that the database remains consistent.

##### Acceptance Criteria

1. THE System SHALL route all addNode calls through SQLiteStorage
2. THE System SHALL route all addEdge calls through SQLiteStorage
3. THE System SHALL route all updateNode calls through SQLiteStorage
4. THE System SHALL route all deleteNode calls through SQLiteStorage
5. WHEN a mutation fails, THE System SHALL rollback the transaction

### Requirement 7.4: ProvenanceRecord Requirement

**User Story:** As a developer, I want every node to have a ProvenanceRecord, so that I can trace the source of all data.

##### Acceptance Criteria

1. WHEN a node is created, THE System SHALL attach a ProvenanceRecord with source spans
2. THE ProvenanceRecord SHALL include the parser type (parser, inference, or config)
3. THE ProvenanceRecord SHALL include a confidence score between 0.0 and 1.0
4. THE ProvenanceRecord SHALL include createdAt and updatedAt timestamps
5. WHEN a node is created without a ProvenanceRecord, THE System SHALL reject the operation

### Requirement 7.5: Build and Test Requirement

**User Story:** As a developer, I want npm run build && npm test to pass after every task, so that I can ensure the system remains stable.

##### Acceptance Criteria

1. WHEN npm run build is executed, THE System SHALL compile without errors
2. WHEN npm test is executed, THE System SHALL pass all tests
3. THE System SHALL maintain test coverage above 70%
4. WHEN a test fails, THE System SHALL display a descriptive error message

### Requirement 7.6: AI Export Shape Preservation

**User Story:** As an AI engineer, I want the AI export shape to remain unchanged, so that existing integrations continue to work.

##### Acceptance Criteria

1. THE System SHALL preserve the version field in AI exports
2. THE System SHALL preserve the project, nodes, edges, summaries, query, and rules fields
3. THE System SHALL preserve the node schema (id, type, name, fullName, location, summary, metadata, provenance)
4. THE System SHALL preserve the edge schema (id, type, from, to, resolved, metadata, provenance)
5. WHEN new fields are added, THE System SHALL add them as optional fields

## Target Outcomes

### Requirement 8.1: 100× Token Reduction

**User Story:** As an AI engineer, I want 100× token reduction for AI context, so that I can fit large codebases into LLM context windows.

##### Acceptance Criteria

1. WHEN semantic deduplication is enabled, THE System SHALL achieve at least 40× token reduction
2. WHEN delta exports are enabled, THE System SHALL achieve at least 60× token reduction for incremental updates
3. WHEN both are enabled, THE System SHALL achieve at least 100× token reduction
4. THE Benchmark_Harness SHALL validate these claims against 3 representative repositories

### Requirement 8.2: 20 MCP Tools

**User Story:** As an AI assistant developer, I want 20 MCP tools, so that I can support advanced agentic workflows.

##### Acceptance Criteria

1. THE MCP_Server SHALL provide exactly 20 tools
2. THE MCP_Server SHALL maintain backward compatibility with the original 7 tools
3. THE MCP_Server SHALL document all tools in the MCP schema
4. THE MCP_Server SHALL pass integration tests for all 20 tools

### Requirement 8.3: Multi-Modal Support

**User Story:** As a developer, I want support for PDF, images, transcripts, YAML, TOML, and SQL, so that I can analyze complete projects.

##### Acceptance Criteria

1. THE System SHALL parse PDF files with text extraction
2. THE System SHALL parse PNG, JPG, and SVG images with OCR
3. THE System SHALL parse WebVTT and SRT transcripts
4. THE System SHALL parse YAML configuration files
5. THE System SHALL parse TOML configuration files
6. THE System SHALL parse SQL schema files

### Requirement 8.4: 90%+ Call Resolution

**User Story:** As a developer, I want 90%+ call resolution accuracy, so that I can trust the call graph.

##### Acceptance Criteria

1. THE Call_Resolver SHALL resolve at least 90% of function calls
2. THE Benchmark_Harness SHALL validate call resolution accuracy
3. THE System SHALL log unresolved calls for debugging

### Requirement 8.5: Production-Ready Security

**User Story:** As a security engineer, I want production-ready security posture, so that I can deploy the system safely.

##### Acceptance Criteria

1. THE System SHALL protect against SSRF attacks
2. THE System SHALL protect against XSS attacks
3. THE System SHALL implement rate limiting
4. THE System SHALL set security headers on all HTTP responses
5. THE System SHALL validate all file paths and uploads
