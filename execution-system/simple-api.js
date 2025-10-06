// const express = require('express');
// const cors = require('cors');
// const { spawn } = require('child_process');
// const fs = require('fs').promises;
// const path = require('path');
// const fetch = require('node-fetch');

// const app = express();
// const PORT = 3000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Language configurations
// const SUPPORTED_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c'];

// // Use the host temp directory path
// const HOST_TEMP_DIR = '/app/temp';

// // Function to fetch problem details from main server
// async function fetchProblem(problemId) {
//   try {
//     const response = await fetch(`http://localhost:5000/api/problems/${problemId}`);
//     if (!response.ok) {
//       throw new Error(`Failed to fetch problem: ${response.statusText}`);
//     }
//     const problem = await response.json();
//     console.log('[API] ✅ Fetched problem:', problem.title);
//     console.log('[API] 📝 Test cases count:', problem.testCases?.length || 0);
//     return problem;
//   } catch (error) {
//     console.error('[API] ❌ Error fetching problem:', error);
//     throw error;
//   }
// }

// function getFilename(language) {
//   if (language === 'java') {
//     return 'Solution.java';
//   }
  
//   const extensions = {
//     python: '.py',
//     javascript: '.js', 
//     typescript: '.ts',
//     java: '.java',
//     cpp: '.cpp',
//     c: '.c'
//   };
  
//   return `code${extensions[language]}`;
// }

// async function writeFile(content, filename) {
//   const filepath = path.join(HOST_TEMP_DIR, filename);
//   try {
//     // Ensure any old files are removed
//     try {
//       await fs.unlink(filepath);
//     } catch (err) {
//       // Ignore if file doesn't exist
//     }
    
//     await fs.writeFile(filepath, content);
//     await fs.chmod(filepath, 0o666);
//     console.log(`[API] ✅ Created file: ${filepath}`);
//     return filepath;
//   } catch (error) {
//     console.error(`❌ Failed to write file ${filepath}:`, error);
//     throw error;
//   }
// }

// async function executeInDocker(language, filename, input, timeLimit = 5000) {
//   const dockerImages = {
//     python: 'execution-system-python',
//     javascript: 'execution-system-javascript',
//     typescript: 'execution-system-javascript',
//     java: 'execution-system-java',
//     cpp: 'execution-system-cpp',
//     c: 'execution-system-c'
//   };

//   const dockerImage = dockerImages[language];
//   if (!dockerImage) {
//     throw new Error(`Unsupported language: ${language}`);
//   }

//   // Commands to run inside container
//   const commands = {
//     python: ['python3', `/tmp/${filename}`],
//     javascript: ['node', `/tmp/${filename}`],
//     typescript: ['node', `/tmp/${filename}`],
//     java: ['sh', '-c', `cd /tmp && javac ${filename} && java Solution`],
//     cpp: ['sh', '-c', `cd /tmp && g++ -o exec ${filename} && ./exec`],
//     c: ['sh', '-c', `cd /tmp && gcc -o exec ${filename} && ./exec`]
//   };

//   const command = commands[language];
  
//   // Use the Windows host path directly for Docker-in-Docker
//   const hostTempPath = 'E:/CodeArena/execution-system/temp';
//   const dockerArgs = [
//     'run', '--rm', '--network=none',
//     '--memory=128m', '--memory-swap=128m', '--cpus=0.5',
//     '--pids-limit=64', '--ulimit', 'nofile=64:64', '--ulimit', 'nproc=32:32',
//     '--ulimit', 'fsize=1000000:1000000', '--user', '1000:1000', '--read-only',
//     '--security-opt=no-new-privileges', '--cap-drop=ALL',
//     '-v', `${hostTempPath}:/tmp:rw`,
//     dockerImage,
//     ...command
//   ];

//   // Create input file with the provided input
//   const inputFile = `input-${Date.now()}.txt`;
//   const inputContent = input || '';
//   await writeFile(inputContent, inputFile);
  
//   console.log(`[API] 📝 Input for execution: "${inputContent}"`);
  
//   // Handle input redirection properly for different command types
//   if (command[0] === 'sh' && command[1] === '-c') {
//     // For shell commands (Java, C++, C), modify the existing shell command
//     const shellCommand = command[2];
//     dockerArgs.splice(-command.length, command.length, 
//       'sh', '-c', `${shellCommand} < /tmp/${inputFile}`);
//   } else {
//     // For direct commands (Python, JavaScript), wrap in shell with input redirection
//     dockerArgs.splice(-command.length, command.length, 
//       'sh', '-c', `${command.join(' ')} < /tmp/${inputFile}`);
//   }

//   console.log(`[API] 🐳 Executing: docker ${dockerArgs.join(' ')}`);

//   return new Promise((resolve, reject) => {
//     const startTime = Date.now();
//     const docker = spawn('docker', dockerArgs);
//     let stdout = '';
//     let stderr = '';
//     let timeoutId;

//     // Set timeout for execution
//     timeoutId = setTimeout(() => {
//       docker.kill('SIGKILL');
//       console.log('[API] ⏰ Execution timed out');
//     }, timeLimit);

//     docker.stdout.on('data', (data) => {
//       const chunk = data.toString();
//       stdout += chunk;
//     });

//     docker.stderr.on('data', (data) => {
//       const chunk = data.toString();
//       stderr += chunk;
//     });

//     docker.on('close', async (code) => {
//       clearTimeout(timeoutId);
//       const runtime = Date.now() - startTime;
      
//       console.log(`[API] 🏁 Process exited with code ${code} in ${runtime}ms`);
//       console.log('[API] 📤 Output:', stdout.trim());
//       if (stderr) console.log('[API] 📥 Error:', stderr.trim());
      
//       // Clean up temp files
//       try {
//         await fs.unlink(path.join(HOST_TEMP_DIR, filename));
//         await fs.unlink(path.join(HOST_TEMP_DIR, inputFile));
//       } catch (err) {
//         // Ignore cleanup errors
//       }

//       if (runtime >= timeLimit) {
//         resolve({
//           status: 'timeout',
//           output: 'Time Limit Exceeded',
//           error: 'Execution timed out',
//           runtime,
//           memory: 0
//         });
//       } else if (code !== 0) {
//         resolve({
//           status: 'error',
//           output: stderr || stdout || 'Runtime Error',
//           error: stderr || 'Runtime Error',
//           runtime,
//           memory: Math.floor(Math.random() * 50) + 5
//         });
//       } else {
//         const output = stdout.trim();
//         resolve({
//           status: 'success',
//           output: output || '',
//           error: '',
//           runtime,
//           memory: Math.floor(Math.random() * 50) + 5
//         });
//       }
//     });

//     docker.on('error', (error) => {
//       clearTimeout(timeoutId);
//       console.error('[API] ❌ Docker error:', error);
//       resolve({
//         status: 'error',
//         output: '',
//         error: error.message,
//         runtime: Date.now() - startTime,
//         memory: 0
//       });
//     });
//   });
// }

// // Function to normalize output for comparison
// function normalizeOutput(output) {
//   return output.trim().replace(/\r\n/g, '\n').replace(/\s+$/gm, '');
// }

// // API endpoints
// app.post('/api/problems/run', async (req, res) => {
//   try {
//     console.log('[API] 🚀 Execution request received');
//     const { code, language, problemId, input } = req.body;

//     if (!code || !language) {
//       return res.status(400).json({
//         status: 'error', 
//         error: 'Code and language are required'
//       });
//     }

//     if (!SUPPORTED_LANGUAGES.includes(language)) {
//       return res.status(400).json({
//         status: 'error', 
//         error: `Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`
//       });
//     }

//     console.log(`[API] 🔧 Processing ${language} code for problem ${problemId || 'custom'}`);
//     const filename = getFilename(language);
//     await writeFile(code, filename);

//     // If problemId is provided, fetch problem details and run test cases from database
//     if (problemId) {
//       try {
//         const problem = await fetchProblem(problemId);
        
//         if (!problem.testCases || problem.testCases.length === 0) {
//           throw new Error('No test cases found for this problem');
//         }

//         console.log(`[API] 📝 Running ${problem.testCases.length} test cases from database`);

//         // Run all test cases from the database
//         const results = [];
//         let allPassed = true;
        
//         for (let i = 0; i < problem.testCases.length; i++) {
//           const testCase = problem.testCases[i];
//           console.log(`[API] 🧪 Running test case ${i + 1}:`, {
//             input: testCase.input,
//             expected: testCase.isHidden ? '[Hidden]' : testCase.expectedOutput
//           });
          
//           const result = await executeInDocker(
//             language, 
//             filename, 
//             testCase.input, 
//             problem.timeLimit || 5000
//           );
          
//           // Compare output with expected output from database
//           const normalizedOutput = normalizeOutput(result.output);
//           const normalizedExpected = normalizeOutput(testCase.expectedOutput);
//           const passed = normalizedOutput === normalizedExpected;
          
//           if (!passed) allPassed = false;

//           const testResult = {
//             ...result,
//             status: result.status === 'success' ? (passed ? 'passed' : 'failed') : result.status,
//             input: testCase.input,
//             expectedOutput: testCase.isHidden ? '[Hidden]' : testCase.expectedOutput,
//             actualOutput: result.output,
//             isHidden: testCase.isHidden,
//             testCaseNumber: i + 1,
//             passed: passed
//           };
          
//           results.push(testResult);
//           console.log(`[API] ${passed ? '✅' : '❌'} Test case ${i + 1}: ${passed ? 'PASSED' : 'FAILED'}`);
//         }
        
//         console.log(`[API] 🏆 All test cases completed. Overall: ${allPassed ? 'PASSED' : 'FAILED'}`);
        
//         res.json({ 
//           results,
//           summary: {
//             totalTests: results.length,
//             passedTests: results.filter(r => r.passed).length,
//             failedTests: results.filter(r => !r.passed).length,
//             allPassed: allPassed,
//             problemTitle: problem.title,
//             difficulty: problem.difficulty
//           }
//         });
        
//       } catch (error) {
//         console.error('[API] ❌ Failed to fetch problem or run test cases:', error);
        
//         // If problem fetch fails, fall back to direct execution with provided input
//         const result = await executeInDocker(language, filename, input || '');
//         console.log('[API] ✅ Fallback execution completed');
        
//         res.json({ 
//           results: [{
//             ...result,
//             input: input || '',
//             expectedOutput: 'N/A (Problem fetch failed)',
//             actualOutput: result.output,
//             testCaseNumber: 1,
//             passed: false
//           }],
//           summary: {
//             totalTests: 1,
//             passedTests: 0,
//             failedTests: 1,
//             allPassed: false,
//             error: error.message
//           }
//         });
//       }
//     } else {
//       // Direct code execution without problem ID (custom input)
//       console.log('[API] 🔧 Direct execution mode (no problem ID)');
//       const result = await executeInDocker(language, filename, input || '');
//       console.log('[API] ✅ Direct execution completed');
      
//       res.json({ 
//         results: [{
//           ...result,
//           input: input || '',
//           expectedOutput: 'N/A (Custom execution)',
//           actualOutput: result.output,
//           testCaseNumber: 1,
//           passed: result.status === 'success'
//         }],
//         summary: {
//           totalTests: 1,
//           passedTests: result.status === 'success' ? 1 : 0,
//           failedTests: result.status === 'success' ? 0 : 1,
//           allPassed: result.status === 'success'
//         }
//       });
//     }
//   } catch (error) {
//     console.error('[API] ❌ Execution failed:', error);
//     res.status(500).json({
//       results: [{
//         status: 'error',
//         output: '',
//         error: error.message,
//         input: 'N/A',
//         expectedOutput: 'N/A',
//         actualOutput: '',
//         runtime: 0,
//         memory: 0,
//         testCaseNumber: 1,
//         passed: false
//       }],
//       summary: {
//         totalTests: 1,
//         passedTests: 0,
//         failedTests: 1,
//         allPassed: false,
//         error: error.message
//       }
//     });
//   }
// });

// // Health check endpoint
// app.get('/health', (req, res) => {
//   res.json({ 
//     status: 'ok', 
//     timestamp: new Date().toISOString(),
//     supportedLanguages: SUPPORTED_LANGUAGES,
//     tempDir: HOST_TEMP_DIR
//   });
// });

// // Get problem details endpoint (for testing)
// app.get('/api/problems/:id', async (req, res) => {
//   try {
//     const problem = await fetchProblem(req.params.id);
//     res.json(problem);
//   } catch (error) {
//     res.status(404).json({ error: error.message });
//   }
// });

// // Ensure temp directory exists
// async function ensureTempDir() {
//   try {
//     await fs.mkdir(HOST_TEMP_DIR, { recursive: true });
//     await fs.chmod(HOST_TEMP_DIR, 0o777);
//     console.log(`[API] 📁 Temp directory ready: ${HOST_TEMP_DIR}`);
//   } catch (error) {
//     console.error('[API] ❌ Failed to create temp directory:', error);
//     throw error;
//   }
// }

// // Graceful shutdown
// process.on('SIGTERM', () => {
//   console.log('[API] 🛑 Received SIGTERM, shutting down gracefully');
//   process.exit(0);
// });

// process.on('SIGINT', () => {
//   console.log('[API] 🛑 Received SIGINT, shutting down gracefully');
//   process.exit(0);
// });

// // Start server
// ensureTempDir().then(() => {
//   app.listen(PORT, () => {
//     console.log(`[API] 🚀 Execution System API listening on port ${PORT}`);
//     console.log(`[API] 🔧 Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
//     console.log(`[API] 📁 Temp directory: ${HOST_TEMP_DIR}`);
//   });
// }).catch((error) => {
//   console.error('[API] ❌ Failed to start server:', error);
//   process.exit(1);
// });

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Language configurations
const SUPPORTED_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'c'];

// Use the host temp directory path for mounting to other containers
const HOST_TEMP_DIR = path.join(process.cwd(), 'execution-system', 'temp');

// Function to fetch problem details from main server
async function fetchProblem(problemId) {
  try {
    const response = await fetch(`http://localhost:5000/api/problems/${problemId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch problem: ${response.statusText}`);
    }
    const problem = await response.json();
    console.log('[API] ✅ Fetched problem:', problem.title);
    console.log('[API] 📝 Test cases count:', problem.testCases?.length || 0);
    return problem;
  } catch (error) {
    console.error('[API] ❌ Error fetching problem:', error);
    throw error;
  }
}

function getFilename(language, sessionId = '') {
  if (language === 'java') {
    return `Solution${sessionId}.java`;
  }
  
  const extensions = {
    python: '.py',
    javascript: '.js', 
    typescript: '.ts',
    java: '.java',
    cpp: '.cpp',
    c: '.c'
  };
  
  return `code${sessionId}${extensions[language]}`;
}

async function writeFile(content, filename) {
  const filepath = path.join(HOST_TEMP_DIR, filename);
  try {
    // Ensure any old files are removed
    try {
      await fs.unlink(filepath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
    
    await fs.writeFile(filepath, content, 'utf8');
    await fs.chmod(filepath, 0o666);
    console.log(`[API] ✅ Created file: ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`❌ Failed to write file ${filepath}:`, error);
    throw error;
  }
}

// Prepare Java code with proper class name
function prepareJavaCode(code, sessionId) {
  const className = `Solution${sessionId}`;
  
  // If code already has a public class, replace it
  if (code.includes('public class')) {
    return code.replace(/public class \w+/g, `public class ${className}`);
  }
  
  // If code has a main method but no class, wrap it
  if (code.includes('public static void main')) {
    return `public class ${className} {\n${code}\n}`;
  }
  
  // If code has neither, create a complete class structure
  return `public class ${className} {
    public static void main(String[] args) {
        ${code}
    }
}`;
}

async function executeInDocker(language, code, input, timeLimit = 5000, sessionId = Date.now()) {
  const dockerImages = {
    python: 'execution-system-python',
    javascript: 'execution-system-javascript',
    typescript: 'execution-system-javascript',
    java: 'execution-system-java',
    cpp: 'execution-system-cpp',
    c: 'execution-system-c'
  };

  const dockerImage = dockerImages[language];
  if (!dockerImage) {
    throw new Error(`Unsupported language: ${language}`);
  }

  // Prepare code and filename
  let processedCode = code;
  const filename = getFilename(language, sessionId);
  
  // Special handling for Java
  if (language === 'java') {
    processedCode = prepareJavaCode(code, sessionId);
  }

  // Write the code file
  await writeFile(processedCode, filename);

  // Commands to run inside container
  const commands = {
    python: ['python3', `/tmp/${filename}`],
    javascript: ['node', `/tmp/${filename}`],
    typescript: ['ts-node', `/tmp/${filename}`],
    java: ['sh', '-c', `cd /tmp && javac ${filename} && java Solution${sessionId}`],
    cpp: ['sh', '-c', `cd /tmp && g++ -std=c++17 -o exec${sessionId} ${filename} && ./exec${sessionId}`],
    c: ['sh', '-c', `cd /tmp && gcc -o exec${sessionId} ${filename} && ./exec${sessionId}`]
  };

  const command = commands[language];
  
  const dockerArgs = [
    'run', '--rm', '--network=none',
    '--memory=128m', '--memory-swap=128m', '--cpus=0.5',
    '--pids-limit=64', '--ulimit', 'nofile=64:64', '--ulimit', 'nproc=32:32',
    '--ulimit', 'fsize=1000000:1000000', '--user', '1000:1000', '--read-only',
    '--security-opt=no-new-privileges', '--cap-drop=ALL',
    '-v', `${HOST_TEMP_DIR}:/tmp:rw`,
    '-i', // Enable interactive mode for stdin
    dockerImage,
    ...command
  ];

  console.log(`[API] 🐳 Executing: docker ${dockerArgs.join(' ')}`);
  console.log(`[API] 📝 Input for execution: "${input || '(empty)'}"`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const docker = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'] // Enable stdin, stdout, stderr pipes
    });
    
    let stdout = '';
    let stderr = '';
    let timeoutId;
    let isResolved = false;

    // Set timeout for execution
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        docker.kill('SIGKILL');
        console.log('[API] ⏰ Execution timed out');
        
        cleanupAllTempFiles().then(() => {
          resolve({
            status: 'timeout',
            output: 'Time Limit Exceeded',
            error: 'Execution timed out',
            runtime: timeLimit,
            memory: 0
          });
        });
      }
    }, timeLimit);

    // Handle stdout
    docker.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log(`[API] 📤 stdout: "${chunk.trim()}"`);
    });

    // Handle stderr
    docker.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      console.log(`[API] 📥 stderr: "${chunk.trim()}"`);
    });

    // Handle process completion
    docker.on('close', async (code) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        const runtime = Date.now() - startTime;
        
        console.log(`[API] 🏁 Process exited with code ${code} in ${runtime}ms`);
        console.log(`[API] 📤 Final output: "${stdout.trim()}"`);
        if (stderr.trim()) console.log(`[API] 📥 Final error: "${stderr.trim()}"`);
        
        // Clean up temp files
        await cleanupAllTempFiles();

        if (code !== 0) {
          resolve({
            status: 'error',
            output: stdout.trim(),
            error: stderr.trim() || 'Runtime Error',
            runtime,
            memory: Math.floor(Math.random() * 50) + 5
          });
        } else {
          resolve({
            status: 'success',
            output: stdout.trim(),
            error: stderr.trim(),
            runtime,
            memory: Math.floor(Math.random() * 50) + 5
          });
        }
      }
    });

    // Handle process errors
    docker.on('error', async (error) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        console.error('[API] ❌ Docker error:', error);
        
        await cleanupAllTempFiles();
        
        resolve({
          status: 'error',
          output: '',
          error: error.message,
          runtime: Date.now() - startTime,
          memory: 0
        });
      }
    });

    // CRITICAL: Write input to stdin and close it
    try {
      if (input !== null && input !== undefined && input !== '') {
        console.log(`[API] 📥 Writing to docker stdin: "${input}"`);
        docker.stdin.write(input);
        
        // Add newline if input doesn't end with one
        if (!input.endsWith('\n')) {
          docker.stdin.write('\n');
        }
      }
      
      console.log(`[API] 🔒 Closing docker stdin`);
      docker.stdin.end();
      
    } catch (stdinError) {
      console.error(`[API] ❌ Error writing to docker stdin:`, stdinError);
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        docker.kill('SIGKILL');
        
        cleanupAllTempFiles().then(() => {
          resolve({
            status: 'error',
            output: '',
            error: `Failed to provide input: ${stdinError.message}`,
            runtime: Date.now() - startTime,
            memory: 0
          });
        });
      }
    }
  });
}

// Clean up temporary files
async function cleanupFiles(filename, sessionId) {
  const filesToClean = [
    filename,
    `exec${sessionId}`, // C/C++ executable
    `Solution${sessionId}.class` // Java class file
  ];
  
  for (const file of filesToClean) {
    try {
      await fs.unlink(path.join(HOST_TEMP_DIR, file));
      console.log(`[API] 🧹 Cleaned up: ${file}`);
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

// Enhanced cleanup function to remove ALL temporary files for all languages
async function cleanupAllTempFiles() {
  try {
    console.log(`[API] 🧹 Starting comprehensive temp directory cleanup...`);
    console.log(`[API] 🧹 Target directory: ${HOST_TEMP_DIR}`);
    
    // Get all files in the temp directory
    const files = await fs.readdir(HOST_TEMP_DIR);
    console.log(`[API] 🧹 Found ${files.length} files in temp directory:`, files);
    
    // Files to clean up for each language
    const cleanupPatterns = [
      // Python files
      /^code.*\.py$/,
      // JavaScript/TypeScript files
      /^code.*\.js$/,
      /^code.*\.ts$/,
      // Java files
      /^Solution.*\.java$/,
      /^Solution.*\.class$/,
      // C/C++ files
      /^code.*\.cpp$/,
      /^code.*\.c$/,
      /^exec.*$/, // Executables
      // Input files
      /^input.*\.txt$/,
      // Any other temporary files
      /^temp.*$/,
      /^.*\.tmp$/
    ];
    
    let cleanedCount = 0;
    
    for (const file of files) {
      // Check if file matches any cleanup pattern
      const shouldClean = cleanupPatterns.some(pattern => pattern.test(file));
      
      if (shouldClean) {
        try {
          const filePath = path.join(HOST_TEMP_DIR, file);
          const stats = await fs.stat(filePath);
          
          // Only delete files, not directories
          if (stats.isFile()) {
            await fs.unlink(filePath);
            console.log(`[API] 🧹 Cleaned up: ${file}`);
            cleanedCount++;
          } else {
            console.log(`[API] ⚠️ Skipping directory: ${file}`);
          }
        } catch (err) {
          console.log(`[API] ⚠️ Could not clean up ${file}:`, err.message);
        }
      } else {
        console.log(`[API] ℹ️ Skipping file (doesn't match patterns): ${file}`);
      }
    }
    
    console.log(`[API] 🧹 Cleanup completed. Removed ${cleanedCount} temporary files.`);
    
  } catch (error) {
    console.error('[API] ❌ Error during cleanup:', error);
  }
}

// Function to normalize output for comparison
function normalizeOutput(output) {
  return output.trim().replace(/\r\n/g, '\n').replace(/\s+$/gm, '');
}

// API endpoints
app.post('/api/problems/run', async (req, res) => {
  try {
    console.log('[API] 🚀 Execution request received');
    const { code, language, problemId, testCases, timeLimit: requestTimeLimit } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        error: 'Code and language are required',
        results: []
      });
    }

    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return res.status(400).json({
        error: `Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
        results: []
      });
    }

    console.log(`[API] 🔧 Processing ${language} code for problem ${problemId || 'custom'}`);

    // Determine which test cases to run
    let casesToRun = [];
    let problemData = null;

    if (problemId && !testCases) {
      // Fetch test cases from database
      try {
        problemData = await fetchProblem(problemId);
        if (!problemData.testCases || problemData.testCases.length === 0) {
          throw new Error('No test cases found for this problem');
        }
        casesToRun = problemData.testCases;
      } catch (error) {
        console.error('[API] ❌ Failed to fetch problem:', error);
        return res.status(404).json({
          error: error.message,
          results: []
        });
      }
    } else if (testCases && Array.isArray(testCases)) {
      // Use test cases provided in request
      casesToRun = testCases;
    } else {
      // Default to empty input for direct execution
      casesToRun = [{ input: '', expectedOutput: '', isHidden: false }];
    }

    console.log(`[API] 📝 Running ${casesToRun.length} test cases`);

    // Run all test cases
    const results = [];
    let allPassed = true;
    const timeLimit = requestTimeLimit || (problemData?.timeLimit) || 5000;
    
    for (let i = 0; i < casesToRun.length; i++) {
      const testCase = casesToRun[i];
      const sessionId = `${Date.now()}_${i}`;
      
      console.log(`[API] 🧪 Running test case ${i + 1}/${casesToRun.length}:`, {
        input: testCase.input || '(empty)',
        expected: testCase.isHidden ? '[Hidden]' : (testCase.expectedOutput || '(empty)')
      });
      
      try {
        const result = await executeInDocker(
          language, 
          code, 
          testCase.input || '', 
          timeLimit,
          sessionId
        );
        
        // Compare output with expected output
        const normalizedOutput = normalizeOutput(result.output);
        const normalizedExpected = normalizeOutput(testCase.expectedOutput || '');
        const passed = result.status === 'success' && normalizedOutput === normalizedExpected;
        
        if (!passed) allPassed = false;

        const testResult = {
          status: result.status === 'success' ? (passed ? 'success' : 'failed') : result.status,
          output: result.output,
          error: result.error,
          runtime: result.runtime,
          memory: result.memory,
          input: testCase.input || '',
          expectedOutput: testCase.expectedOutput || '',
          isHidden: testCase.isHidden || false,
          testCaseNumber: i + 1,
          passed: passed
        };
        
        results.push(testResult);
        console.log(`[API] ${passed ? '✅' : '❌'} Test case ${i + 1}: ${passed ? 'PASSED' : 'FAILED'}`);
        
      } catch (error) {
        console.error(`[API] ❌ Error executing test case ${i + 1}:`, error);
        allPassed = false;
        
        results.push({
          status: 'error',
          output: '',
          error: error.message,
          runtime: 0,
          memory: 0,
          input: testCase.input || '',
          expectedOutput: testCase.expectedOutput || '',
          isHidden: testCase.isHidden || false,
          testCaseNumber: i + 1,
          passed: false
        });
      }
    }
    
    console.log(`[API] 🏆 All test cases completed. Overall: ${allPassed ? 'PASSED' : 'FAILED'}`);
    
    // Clean up ALL temporary files after execution is complete
    await cleanupAllTempFiles();
    
    res.json({ 
      results,
      summary: {
        totalTests: results.length,
        passedTests: results.filter(r => r.passed).length,
        failedTests: results.filter(r => !r.passed).length,
        allPassed: allPassed,
        problemTitle: problemData?.title || 'Custom Execution',
        difficulty: problemData?.difficulty || 'N/A'
      }
    });
    
  } catch (error) {
    console.error('[API] ❌ Execution failed:', error);
    
    // Clean up ALL temporary files even if execution failed
    await cleanupAllTempFiles();
    
    res.status(500).json({
      error: error.message,
      results: []
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    supportedLanguages: SUPPORTED_LANGUAGES,
    tempDir: HOST_TEMP_DIR
  });
});

// Manual cleanup endpoint for administrators
app.post('/api/cleanup', async (req, res) => {
  try {
    console.log('[API] 🧹 Manual cleanup requested');
    await cleanupAllTempFiles();
    
    res.json({ 
      status: 'success',
      message: 'Temporary files cleaned up successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] ❌ Manual cleanup failed:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

// Test cleanup endpoint to see what's in the temp directory
app.get('/api/cleanup/test', async (req, res) => {
  try {
    console.log('[API] 🧪 Testing cleanup function...');
    
    // List all files in temp directory
    const files = await fs.readdir(HOST_TEMP_DIR);
    const fileStats = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(HOST_TEMP_DIR, file);
        const stats = await fs.stat(filePath);
        fileStats.push({
          name: file,
          isFile: stats.isFile(),
          size: stats.size,
          modified: stats.mtime
        });
      } catch (err) {
        fileStats.push({
          name: file,
          error: err.message
        });
      }
    }
    
    res.json({ 
      tempDir: HOST_TEMP_DIR,
      fileCount: files.length,
      files: fileStats
    });
  } catch (error) {
    console.error('[API] ❌ Test cleanup failed:', error);
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

// Get problem details endpoint (for testing)
app.get('/api/problems/:id', async (req, res) => {
  try {
    const problem = await fetchProblem(req.params.id);
    res.json(problem);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Test endpoint for quick execution
app.post('/api/execute', async (req, res) => {
  try {
    const { code, language, input = '' } = req.body;
    
    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }
    
    console.log('[API] 🧪 Quick execution test');
    const result = await executeInDocker(language, code, input);
    
    // Clean up ALL temporary files after execution
    await cleanupAllTempFiles();
    
    res.json({
      status: result.status,
      output: result.output,
      error: result.error,
      runtime: result.runtime,
      memory: result.memory
    });
    
  } catch (error) {
    console.error('[API] ❌ Quick execution failed:', error);
    
    // Clean up even if execution failed
    await cleanupAllTempFiles();
    
    res.status(500).json({ error: error.message });
  }
});

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(HOST_TEMP_DIR, { recursive: true });
    await fs.chmod(HOST_TEMP_DIR, 0o777);
    console.log(`[API] 📁 Temp directory ready: ${HOST_TEMP_DIR}`);
  } catch (error) {
    console.error('[API] ❌ Failed to create temp directory:', error);
    throw error;
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[API] 🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[API] 🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start server
ensureTempDir().then(() => {
  app.listen(PORT, () => {
    console.log(`[API] 🚀 Execution System API listening on port ${PORT}`);
    console.log(`[API] 🔧 Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
    console.log(`[API] 📁 Temp directory: ${HOST_TEMP_DIR}`);
    console.log(`[API] 🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`[API] 🏃 Quick test: POST http://localhost:${PORT}/api/execute`);
  });
}).catch((error) => {
  console.error('[API] ❌ Failed to start server:', error);
  process.exit(1);
});