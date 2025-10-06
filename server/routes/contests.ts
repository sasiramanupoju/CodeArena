// @ts-nocheck

import { Router, Request, Response } from 'express';
import { contestStorage } from '../services/contestStorage';
import { executionService } from '../services/executionService';
import { insertContestSchema, contestParticipantSchema, contestQuestionSchema } from '../shared-schema';
import { protect } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import QRCode from 'qrcode';
import { requireAdmin } from '../middleware/auth';

const router = Router();

// Test route to check if authentication is working
router.get('/test-auth', protect, async (req: AuthRequest, res: Response) => {
  console.log('🔐 [CONTEST-TEST] Test auth route reached');
  console.log('🔐 [CONTEST-TEST] User:', req.user?.id, 'Role:', req.user?.role);
  res.json({ 
    message: 'Authentication working', 
    user: { id: req.user?.id, role: req.user?.role },
    timestamp: new Date().toISOString()
  });
});

// Contest Management Routes (Admin Only)
router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { selectedProblems, ...contestData } = req.body;
    
    console.log('[DEBUG] Creating contest with data:', {
      title: contestData.title,
      startTime: contestData.startTime,
      endTime: contestData.endTime,
      duration: contestData.duration,
      timeZone: contestData.timeZone
    });
    
    // Validate time fields
    if (!contestData.startTime || !contestData.endTime) {
      return res.status(400).json({ 
        message: 'Start time and end time are required for contests',
        missingFields: {
          startTime: !contestData.startTime,
          endTime: !contestData.endTime
        }
      });
    }
    
    // Ensure dates are properly parsed
    const startTime = new Date(contestData.startTime);
    const endTime = new Date(contestData.endTime);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({ 
        message: 'Invalid date format for start time or end time' 
      });
    }
    
    if (startTime >= endTime) {
      return res.status(400).json({ 
        message: 'Start time must be before end time' 
      });
    }
    
    // Calculate duration if not provided
    if (!contestData.duration) {
      const durationMs = endTime.getTime() - startTime.getTime();
      contestData.duration = Math.ceil(durationMs / (1000 * 60)); // Convert to minutes
      console.log('[DEBUG] Calculated duration:', contestData.duration, 'minutes');
    }
    
    // Create problem instances from selected problems
    const problemInstances = selectedProblems && selectedProblems.length > 0 
      ? await contestStorage.createContestProblemInstances(selectedProblems, `contest_${Date.now()}`)
      : [];

    const contest = await contestStorage.createContest({
      ...contestData,
      startTime,
      endTime,
      problems: problemInstances,
      createdBy: req.user.id
    });

    // Check if contest has already ended by time and update accordingly
    const now = new Date();
    if (now > endTime) {
      await contestStorage.updateContestEndMethod(contest.id, 'time_expired');
      console.log('[DEBUG] Contest created with time_expired status');
    }

    console.log('[DEBUG] Contest created successfully:', contest.id);
    res.status(201).json(contest);
  } catch (error) {
    console.error('Error creating contest:', error);
    res.status(400).json({ message: 'Failed to create contest', error: error.message });
  }
});

// Get all problems for contest creation
router.get('/available-problems', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    const problems = await contestStorage.getAllProblems();
    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems for contest:', error);
    res.status(500).json({ message: 'Failed to fetch problems' });
  }
});

// Contests endpoint with participant counts (accessible at both /api/contests and /api/admin/contests)
router.get('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    console.log('🔐 [CONTEST-ROUTE] === ROUTE REACHED ===');
    console.log('🔐 [CONTEST-ROUTE] User authenticated:', req.user?.id, 'Role:', req.user?.role);
    console.log('🔐 [CONTEST-ROUTE] Request URL:', req.originalUrl);
    console.log('🔐 [CONTEST-ROUTE] Request headers:', req.headers);
    
    // Check if this is an admin request by checking the URL path
    if (req.originalUrl.includes('/api/admin/contests')) {
      try {
        const contests = await contestStorage.getAllContests();
        
        const contestsWithParticipants = await Promise.all(
          contests.map(async (contest) => {
            try {
              const participants = await contestStorage.getContestParticipants(contest.id);
              return {
                ...contest,
                participantCount: participants.length
              };
            } catch (error) {
              console.error('Error fetching participants for contest:', contest.id, error);
              return {
                ...contest,
                participantCount: 0
              };
            }
          })
        );
        
        res.json(contestsWithParticipants);
      } catch (error) {
        console.error("Error fetching admin contests:", error);
        res.status(500).json({ message: "Failed to fetch contests" });
      }
    } else {
      // Regular contests endpoint for non-admin users
  try {
    const { status, type, visibility } = req.query;
    const filters = {
      status: status as string,
      type: type as string,
      visibility: visibility as string
    };

    const contests = await contestStorage.getAllContests(filters);
        
        // Get user's contest enrollments
        const userEnrollments = await contestStorage.getUserContestEnrollments(req.user.id);
        const enrolledContestIds = new Set(userEnrollments.map(e => e.contestId));
        
        // Ensure all contests have updated rankings
        for (const contest of contests) {
          try {
            await contestStorage.updateRankings(contest.id);
          } catch (error) {
            console.error('Error updating rankings for contest:', contest.id, error);
          }
        }
        
        // Filter to only show enrolled contests for regular users
        const enrolledContests = contests.filter(contest => enrolledContestIds.has(contest.id));
        
        // Add participant counts and enrollment status to enrolled contests only
        const contestsWithParticipants = await Promise.all(
          enrolledContests.map(async (contest) => {
            try {
              // Use the participants array stored in the contest document
              const participantCount = (contest.participants || []).length;
              const isEnrolled = true; // All contests here are enrolled
              
              // Get user's progress in this contest
              let userProgress = null;
              try {
                const enrollment = userEnrollments.find(e => e.contestId === contest.id);
                userProgress = {
                  isEnrolled: true,
                  enrolledAt: enrollment?.enrolledAt,
                  problemsSolved: enrollment?.problemsSolved || 0,
                  rank: enrollment?.rank || 0
                };
              } catch (error) {
                console.error('Error fetching user progress for contest:', contest.id, error);
              }
              
              return {
                ...contest,
                participantCount: participantCount,
                isEnrolled,
                userProgress
              };
            } catch (error) {
              console.error('Error processing contest:', contest.id, error);
              return {
                ...contest,
                participantCount: (contest.participants || []).length,
                isEnrolled: true,
                userProgress: null
              };
            }
          })
        );
        
        res.json(contestsWithParticipants);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Failed to fetch contests' });
      }
    }
  } catch (error) {
    console.error('🔐 [CONTEST-ROUTE] Error in main route handler:', error);
    res.status(500).json({ 
      message: 'Failed to fetch contests',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});



router.get('/:contestId', async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const contest = await contestStorage.getContest(contestId);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Use the participants array stored in the contest document
    const participants = contest.participants || [];
    const participantCount = participants.length;
    
    // If we need detailed participant info, fetch it
    let detailedParticipants = [];
    if (participants.length > 0) {
      try {
        detailedParticipants = await contestStorage.getContestParticipants(contestId);
      } catch (error) {
        console.error('Error fetching detailed participants for contest:', contestId, error);
        // Continue with basic participant data
      }
    }
    
    const contestWithParticipants = {
      ...contest,
      participants: detailedParticipants.length > 0 ? detailedParticipants : participants,
      participantCount: participantCount
    };
    
    res.json(contestWithParticipants);
  } catch (error) {
    console.error('Error fetching contest:', error);
    res.status(500).json({ message: 'Failed to fetch contest' });
  }
});

router.put('/:contestId', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    const { selectedProblems, ...contestData } = req.body;
    
    console.log('[DEBUG] Updating contest:', contestId);
    console.log('[DEBUG] Contest update data:', {
      title: contestData.title,
      startTime: contestData.startTime,
      endTime: contestData.endTime,
      duration: contestData.duration,
      timeZone: contestData.timeZone
    });
    
    let updates = { ...contestData };
    
    // Validate time fields if they are being updated
    if (contestData.startTime || contestData.endTime) {
      const startTime = contestData.startTime ? new Date(contestData.startTime) : undefined;
      const endTime = contestData.endTime ? new Date(contestData.endTime) : undefined;
      
      if (startTime && isNaN(startTime.getTime())) {
        return res.status(400).json({ message: 'Invalid start time format' });
      }
      
      if (endTime && isNaN(endTime.getTime())) {
        return res.status(400).json({ message: 'Invalid end time format' });
      }
      
      if (startTime && endTime && startTime >= endTime) {
        return res.status(400).json({ message: 'Start time must be before end time' });
      }
      
      // Update the time fields with parsed dates
      if (startTime) updates.startTime = startTime;
      if (endTime) updates.endTime = endTime;
      
      // Recalculate duration if both times are provided
      if (startTime && endTime && !contestData.duration) {
        const durationMs = endTime.getTime() - startTime.getTime();
        updates.duration = Math.ceil(durationMs / (1000 * 60)); // Convert to minutes
        console.log('[DEBUG] Recalculated duration:', updates.duration, 'minutes');
      }
      
      // Reset contestEndMethod when rescheduling (updating times)
      // This allows rescheduled contests to be active again
      updates.contestEndMethod = null;
      console.log('[DEBUG] Contest rescheduled - resetting contestEndMethod to null');
    }
    
    // Handle problem updates if selectedProblems are provided
    if (Array.isArray(selectedProblems) && selectedProblems.length > 0) {
      console.log('[DEBUG] Creating new problem instances for contest update');
      const problemInstances = await contestStorage.createContestProblemInstances(
        selectedProblems, 
        `contest_${contestId}_${Date.now()}`
      );
      updates.problems = problemInstances;
      console.log('[DEBUG] Created problem instances:', problemInstances.length);
    }
    
    const contest = await contestStorage.updateContest(contestId, updates);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // If contest was rescheduled (times updated), reset participant end methods
    if (contestData.startTime || contestData.endTime) {
      await contestStorage.updateAllParticipantsContestEndMethod(contestId, null);
      console.log('[DEBUG] Reset all participants contestEndMethod to null for rescheduled contest');
    }

    // Check if contest has ended by time and update accordingly
    if (updates.endTime) {
      const now = new Date();
      const newEndTime = new Date(updates.endTime);
      if (now > newEndTime) {
        await contestStorage.updateContestEndMethod(contestId, 'time_expired');
        console.log('[DEBUG] Contest updated with time_expired status');
      }
    }

    console.log('[DEBUG] Contest updated successfully:', contest.id);
    res.json(contest);
  } catch (error) {
    console.error('Error updating contest:', error);
    res.status(400).json({ message: 'Failed to update contest', error: error.message });
  }
});

router.delete('/:contestId', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    const deleted = await contestStorage.deleteContest(contestId);
    
    if (!deleted) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    res.json({ message: 'Contest deleted successfully' });
  } catch (error) {
    console.error('Error deleting contest:', error);
    res.status(500).json({ message: 'Failed to delete contest' });
  }
});

// Problem Management within Contests
router.post('/:contestId/problems', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    const problem = req.body;
    
    const success = await contestStorage.addProblemToContest(contestId, problem);
    
    if (!success) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    res.json({ message: 'Problem added successfully' });
  } catch (error) {
    console.error('Error adding problem to contest:', error);
    res.status(400).json({ message: 'Failed to add problem', error: error.message });
  }
});

router.get('/:contestId/problems', async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const problems = await contestStorage.getContestProblems(contestId);
    res.json(problems);
  } catch (error) {
    console.error('Error fetching contest problems:', error);
    res.status(500).json({ message: 'Failed to fetch problems' });
  }
});

router.put('/:contestId/problems/:problemId', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId, problemId } = req.params;
    const updates = req.body;
    
    const success = await contestStorage.updateContestProblem(contestId, problemId, updates);
    
    if (!success) {
      return res.status(404).json({ message: 'Contest or problem not found' });
    }

    res.json({ message: 'Problem updated successfully' });
  } catch (error) {
    console.error('Error updating contest problem:', error);
    res.status(400).json({ message: 'Failed to update problem', error: error.message });
  }
});

router.delete('/:contestId/problems/:problemId', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId, problemId } = req.params;
    
    const success = await contestStorage.removeProblemFromContest(contestId, problemId);
    
    if (!success) {
      return res.status(404).json({ message: 'Contest or problem not found' });
    }

    res.json({ message: 'Problem removed successfully' });
  } catch (error) {
    console.error('Error removing problem from contest:', error);
    res.status(500).json({ message: 'Failed to remove problem' });
  }
});

// Participant Management
// Add new endpoint to check if user is enrolled in contest
router.get('/:contestId/participants/me', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const participants = await contestStorage.getContestParticipants(contestId);
    const userParticipation = participants.find(p => p.userId === userId);
    
    if (userParticipation) {
      res.json(userParticipation);
    } else {
      res.status(404).json({ message: 'User not enrolled in this contest' });
    }
  } catch (error: any) {
    console.error('Error checking user contest participation:', error);
    res.status(500).json({ message: 'Failed to check participation' });
  }
});

// Modify the existing register endpoint to support admin enrollment
router.post('/:contestId/register', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const { userId } = req.body;
    const requesterId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    console.log('[DEBUG] Register participant request:', {
      contestId,
      userId,
      requesterId,
      isAdmin,
      body: req.body
    });

    if (!requesterId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    let targetUserId: string;
    if (isAdmin && userId && userId !== 'self') {
      targetUserId = userId;
    } else {
      targetUserId = requesterId;
    }

    console.log('[DEBUG] Target user ID:', targetUserId);

    // Check if contest exists
    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const participants = await contestStorage.getContestParticipants(contestId);
    const isAlreadyRegistered = participants.some(p => p.userId === targetUserId);

    console.log('[DEBUG] Current participants:', participants.length);
    console.log('[DEBUG] Is already registered:', isAlreadyRegistered);

    if (isAlreadyRegistered) {
      return res.status(409).json({
        message: 'User is already registered for this contest',
        alreadyEnrolled: true
      });
    }

    // Use appropriate enrollment method based on who is enrolling
    let participant;
    if (isAdmin && userId && userId !== 'self') {
      // Admin enrolling another user
      participant = await contestStorage.registerParticipantByAdmin(contestId, targetUserId);
    } else {
      // Self-enrollment
      participant = await contestStorage.registerParticipant(contestId, targetUserId);
    }
    
    console.log('[DEBUG] Participant registered successfully:', participant.id);
    
    // Return enriched participant data with user information
    const user = await contestStorage.getUser(targetUserId);
    const enrichedParticipant = {
      ...participant,
      user: user ? {
        id: user.id || user._id?.toString(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
      } : null
    };
    
    res.status(201).json(enrichedParticipant);
  } catch (error: any) {
    console.error('Error registering participant:', error);
    res.status(400).json({ message: 'Failed to register for contest', error: error.message });
  }
});

router.delete('/:contestId/register', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const success = await contestStorage.unregisterParticipant(contestId, userId);
    
    if (!success) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    res.json({ message: 'Unregistered successfully' });
  } catch (error) {
    console.error('Error unregistering participant:', error);
    res.status(500).json({ message: 'Failed to unregister' });
  }
});

router.get('/:contestId/participants', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    const participants = await contestStorage.getContestParticipants(contestId);
    // Ensure a consistent shape with user name fields to avoid UI fallback to raw id
    const normalized = (participants || []).map((p: any) => ({
      ...p,
      user: p.user ? {
        id: p.user.id,
        firstName: p.user.firstName || '',
        lastName: p.user.lastName || '',
        email: p.user.email || '',
      } : null,
    }));
    res.json(normalized);
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({ message: 'Failed to fetch participants' });
  }
});

// Remove participant endpoint
router.delete('/:contestId/participants/:userId', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId, userId } = req.params;
    const success = await contestStorage.unregisterParticipant(contestId, userId);
    
    if (success) {
      res.json({ message: 'Participant removed successfully' });
    } else {
      res.status(404).json({ message: 'Participant not found' });
    }
  } catch (error: any) {
    console.error('Error removing participant:', error);
    res.status(500).json({ message: 'Failed to remove participant' });
  }
});

// Submissions & Execution
router.post('/:contestId/submit', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const { problemId, code, language } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Verify participant is registered
    const participants = await contestStorage.getContestParticipants(contestId);
    const isRegistered = participants.some(p => p.userId === userId);
    
    if (!isRegistered) {
      return res.status(403).json({ message: 'Must be registered for contest' });
    }

    // Get the problem and its test cases
    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const problem = contest.problems?.find(p => p.id === problemId);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found in contest' });
    }

    // Get test cases from the problem
    let testCases = [];
    if (problem.testCases && Array.isArray(problem.testCases)) {
      testCases = problem.testCases;
    } else if (problem.customTestCases && Array.isArray(problem.customTestCases)) {
      testCases = problem.customTestCases;
    }

    if (testCases.length === 0) {
      return res.status(400).json({ message: 'No test cases available for this problem' });
    }

    // Execute code against all test cases (including hidden ones)
    const executionResult = await executionService.executeWithTestCases(code, language, testCases);

    // Calculate results based on actual test case execution
    const passedCount = executionResult.testResults.filter((r: any) => r.passed).length;
    const totalTestCases = executionResult.testResults.length;
    const allPassed = executionResult.allTestsPassed;
    const status = allPassed ? 'accepted' : passedCount > 0 ? 'partial' : 'wrong_answer';
    
    // Calculate points based on contest scoring (assuming 100 points per problem)
    const points = allPassed ? 100 : Math.floor((passedCount / totalTestCases) * 100);
    
    // Get runtime and memory from execution results
    const runtime = executionResult.testResults.reduce((sum: number, r: any) => sum + (r.runtime || 0), 0) / totalTestCases;
    const memory = executionResult.testResults.reduce((sum: number, r: any) => Math.max(sum, r.memory || 0), 0);

    const submission = await contestStorage.submitSolution({
      contestId,
      problemId,
      userId,
      code,
      language,
      status,
      runtime: Math.round(runtime),
      memory: Math.round(memory),
      points,
      submissionTime: new Date(),
      penalty: 0,
      isContestSubmission: true,
      testResults: executionResult.testResults
    });

    // Return detailed results including test case information
    res.json({
      ...submission,
      testResults: executionResult.testResults,
      passedCount,
      totalTestCases,
      allPassed,
      status,
      points,
      runtime: Math.round(runtime),
      memory: Math.round(memory)
    });
  } catch (error) {
    console.error('Error submitting solution:', error);
    res.status(400).json({ message: 'Failed to submit solution', error: (error as any).message });
  }
});

router.post('/:contestId/problems/:problemId/submit', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId, problemId } = req.params;
    const { code, language, autoSubmitted } = req.body;
    const userId = req.user?.id;

    console.log(`[CONTEST-SUBMIT] Submission attempt: contestId=${contestId}, problemId=${problemId}, userId=${userId}, autoSubmitted=${autoSubmitted}`);

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Verify registration
    const participants = await contestStorage.getContestParticipants(contestId);
    const isRegistered = participants.some(p => p.userId === userId);
    if (!isRegistered) {
      console.log(`[CONTEST-SUBMIT] User ${userId} not registered for contest ${contestId}`);
      return res.status(403).json({ message: 'Must be registered for contest' });
    }

    console.log(`[CONTEST-SUBMIT] User ${userId} is registered for contest ${contestId}`);

    // Get the problem and its test cases
    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const problem = contest.problems?.find(p => p.id === problemId);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found in contest' });
    }

    // Get test cases from the problem
    let testCases = [];
    if (problem.testCases && Array.isArray(problem.testCases)) {
      testCases = problem.testCases;
    } else if (problem.customTestCases && Array.isArray(problem.customTestCases)) {
      testCases = problem.customTestCases;
    }

    if (testCases.length === 0) {
      return res.status(400).json({ message: 'No test cases available for this problem' });
    }

    // Execute code against all test cases (including hidden ones)
    const executionResult = await executionService.executeWithTestCases(code, language, testCases);

    // Calculate results based on actual test case execution
    const passedCount = executionResult.testResults.filter((r: any) => r.passed).length;
    const totalTestCases = executionResult.testResults.length;
    const allPassed = executionResult.allTestsPassed;
    const status = allPassed ? 'accepted' : passedCount > 0 ? 'partial' : 'wrong_answer';
    
    // Calculate points based on contest scoring (assuming 100 points per problem)
    const points = allPassed ? 100 : Math.floor((passedCount / totalTestCases) * 100);
    
    // Get runtime and memory from execution results
    const runtime = executionResult.testResults.reduce((sum: number, r: any) => sum + (r.runtime || 0), 0) / totalTestCases;
    const memory = executionResult.testResults.reduce((sum: number, r: any) => Math.max(sum, r.memory || 0), 0);

    const submission = await contestStorage.submitSolution({
      contestId,
      problemId,
      userId,
      code,
      language,
      status,
      runtime: Math.round(runtime),
      memory: Math.round(memory),
      points,
      submissionTime: new Date(),
      penalty: 0,
      isContestSubmission: true,
      testResults: executionResult.testResults
    });

    // Return detailed results including test case information
    console.log(`[CONTEST-SUBMIT] Successfully submitted solution: submissionId=${submission.id}, status=${submission.status}, points=${points}, autoSubmitted=${autoSubmitted}`);
    
    res.json({
      id: submission.id,
      problemId: submission.problemId,
      code: submission.code,
      language: submission.language,
      status: submission.status,
      runtime: submission.runtime,
      memory: submission.memory,
      submissionTime: submission.submissionTime,
      testResults: executionResult.testResults,
      passedCount,
      totalTestCases,
      allPassed,
      points
    });
  } catch (error) {
    console.error('Error submitting solution (problem-specific):', error);
    res.status(400).json({ message: 'Failed to submit solution', error: (error as any).message });
  }
});

router.get('/:contestId/submissions', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const userId = req.query.userId as string;

    // Admins can see all submissions, users can only see their own
    if (userId && req.user?.role !== 'admin' && req.user?.id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const submissions = await contestStorage.getContestSubmissions(contestId, userId);
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Failed to fetch submissions' });
  }
});

// Leaderboard & Rankings
router.get('/:contestId/leaderboard', async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const leaderboard = await contestStorage.generateLeaderboard(contestId);

    // Normalize response shape expected by client
    const normalized = (leaderboard || []).map((e: any) => ({
      rank: e.rank,
      userId: e.userId,
      userName: e.userName || e.username || e.userId,
      totalScore: e.totalScore ?? e.points ?? 0,
      totalPenalty: e.totalPenalty ?? 0,
      problemsSolved: e.problemsSolved ?? 0,
      submissions: e.submissions?.length ?? e.submissions ?? 0,
      lastSubmission: e.lastSubmission || e.lastSubmissionTime || '',
      problemScores: e.problemScores || {},
    }));

    res.json(normalized);
  } catch (error) {
    console.error('Error generating leaderboard:', error);
    res.status(500).json({ message: 'Failed to generate leaderboard' });
  }
});

router.post('/:contestId/update-rankings', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    await contestStorage.updateRankings(contestId);
    const leaderboard = await contestStorage.generateLeaderboard(contestId);
    res.json({ message: 'Rankings updated successfully', leaderboard });
  } catch (error) {
    console.error('Error updating rankings:', error);
    res.status(500).json({ message: 'Failed to update rankings' });
  }
});

// Analytics
router.get('/:contestId/analytics', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    const analytics = await contestStorage.getContestAnalytics(contestId);
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

// Q&A System
router.post('/:contestId/questions', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const { problemId, question, isPublic } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const questionData = await contestStorage.submitQuestion({
      contestId,
      userId: userId as string,
      problemId,
      question,
      timestamp: new Date(),
      status: 'pending',
      isPublic: Boolean(isPublic)
    });

    res.status(201).json(questionData);
  } catch (error) {
    console.error('Error submitting question:', error);
    res.status(400).json({ message: 'Failed to submit question', error: (error as any).message });
  }
});

router.get('/:contestId/questions', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const isPublic = req.query.public === 'true';

    const questions = await contestStorage.getContestQuestions(contestId, isPublic);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ message: 'Failed to fetch questions' });
  }
});

router.put('/questions/:questionId/answer', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { questionId } = req.params;
    const { answer } = req.body;
    const answeredBy = req.user?.id;

    if (!answeredBy) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const success = await contestStorage.answerQuestion(questionId, answer, answeredBy);
    
    if (!success) {
      return res.status(404).json({ message: 'Question not found' });
    }

    res.json({ message: 'Question answered successfully' });
  } catch (error) {
    console.error('Error answering question:', error);
    res.status(400).json({ message: 'Failed to answer question', error: error.message });
  }
});

// Announcements
router.post('/:contestId/announcements', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    const { message, priority } = req.body;

    const success = await contestStorage.addAnnouncement(contestId, message, priority);
    
    if (!success) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    res.json({ message: 'Announcement added successfully' });
  } catch (error) {
    console.error('Error adding announcement:', error);
    res.status(400).json({ message: 'Failed to add announcement', error: error.message });
  }
});

router.get('/:contestId/announcements', async (req: Request, res: Response) => {
  try {
    const { contestId } = req.params;
    const announcements = await contestStorage.getAnnouncements(contestId);
    res.json(announcements);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ message: 'Failed to fetch announcements' });
  }
});

// Add QR code generation endpoint for contests
router.get('/:contestId/qr-code', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { contestId } = req.params;
    
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const enrollmentUrl = `${frontendUrl}/contest-enrollment/${contestId}`;
    
    const qrCode = await QRCode.toDataURL(enrollmentUrl);

    res.json({ qrCode, enrollmentUrl });
  } catch (error: any) {
    console.error('Error generating QR code for contest:', error);
    res.status(500).json({ message: 'Failed to generate QR code' });
  }
});

// Code execution for contest problems
router.post('/execute', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language, input } = req.body;

    if (!code || !language) {
      return res.status(400).json({ message: "Code and language are required" });
    }

    console.log(`🚀 [CONTEST-EXEC] Executing ${language} code for contest problem`);
    console.log(`📝 [CONTEST-EXEC] Code length: ${code.length} characters`);
    console.log(`🔧 [CONTEST-EXEC] Language: ${language}`);
    console.log(`📥 [CONTEST-EXEC] Input: "${input || 'none'}"`);
    console.log(`📥 [CONTEST-EXEC] Input length: ${input ? input.length : 0}`);
    console.log(`📥 [CONTEST-EXEC] Input type: ${typeof input}`);
    
    // Import the execution service
    const { executionService } = await import('../services/executionService');
    
    // Use the same Docker execution service as assignments
    const result = await executionService.executeCode(code, language, input);
    
    console.log(`✅ [CONTEST-EXEC] Execution completed`);
    console.log(`📊 [CONTEST-EXEC] Runtime: ${result.runtime}ms, Memory: ${result.memory}MB`);
    console.log(`📤 [CONTEST-EXEC] Output length: ${result.output?.length || 0} characters`);
    if (result.error) {
      console.log(`❌ [CONTEST-EXEC] Error: ${result.error}`);
    }

    res.json({
      status: result.error ? 'error' : 'success',
      output: result.output,
      error: result.error,
      runtime: result.runtime,
      memory: result.memory
    });
  } catch (error) {
    console.error("Error executing contest code:", error);
    res.status(500).json({ 
      message: "Failed to execute code",
      status: 'error',
      error: (error as any).message || 'Internal server error'
    });
  }
});

// Custom input execution for contest problems
router.post('/run-custom-input', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { code, language, customInput } = req.body;

    if (!code || !language || !customInput) {
      return res.status(400).json({
        error: 'Missing required fields: code, language, and customInput'
      });
    }

    console.log(`🚀 [CONTEST-CUSTOM-EXEC] Executing ${language} code with custom input for contest problem`);
    console.log(`📝 [CONTEST-CUSTOM-EXEC] Code length: ${code.length} characters`);
    console.log(`📥 [CONTEST-CUSTOM-EXEC] Custom input: "${customInput}"`);
    
    // Import the execution service
    const { executionService } = await import('../services/executionService');
    
    // Use the same Docker execution service as assignments
    const result = await executionService.executeCode(code, language, customInput);
    
    console.log(`✅ [CONTEST-CUSTOM-EXEC] Execution completed`);
    console.log(`📊 [CONTEST-CUSTOM-EXEC] Runtime: ${result.runtime}ms, Memory: ${result.memory}MB`);
    console.log(`📤 [CONTEST-CUSTOM-EXEC] Output length: ${result.output?.length || 0} characters`);
    if (result.error) {
      console.log(`❌ [CONTEST-CUSTOM-EXEC] Error: ${result.error}`);
    }

    res.json({
      status: result.error ? 'error' : 'success',
      output: result.output,
      error: result.error,
      runtime: result.runtime,
      memory: result.memory,
      input: customInput,
      mode: 'custom_input'
    });
  } catch (error) {
    console.error("Error executing contest code with custom input:", error);
    res.status(500).json({ 
      status: 'error',
      error: 'Internal server error',
      output: (error as any).message || 'Execution failed'
    });
  }
});

// Get contest standings with detailed stats
router.get('/:contestId/standings', protect, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = req.params.contestId;
    const leaderboard = await contestStorage.generateLeaderboard(contestId);
    const contest = await contestStorage.getContest(contestId);
    
    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }

    // Add problem-specific stats to each leaderboard entry
    const detailedStandings = await Promise.all(
      leaderboard.map(async (entry) => {
        const userSubmissions = await contestStorage.getParticipantSubmissions(contestId, entry.userId);
        const problemStats = contest.problems.map(problem => {
          const problemSubmissions = userSubmissions.filter(s => s.problemId === problem.id);
          const acceptedSubmission = problemSubmissions.find(s => s.status === 'accepted');
          const wrongAttempts = problemSubmissions.filter(s => s.status === 'wrong_answer').length;
          
          return {
            problemId: problem.id,
            problemTitle: problem.title,
            points: problem.points,
            solved: !!acceptedSubmission,
            attempts: problemSubmissions.length,
            wrongAttempts,
            solvedAt: acceptedSubmission?.submissionTime,
            bestRuntime: acceptedSubmission?.runtime,
            bestMemory: acceptedSubmission?.memory
          };
        });

        // Resolve participant name
        let displayName = entry.username || entry.userId;
        try {
          const userDoc = await contestStorage.getUser(entry.userId);
          if (userDoc) {
            const first = (userDoc.firstName || userDoc.given_name || '').toString().trim();
            const last = (userDoc.lastName || userDoc.family_name || '').toString().trim();
            const full = `${first} ${last}`.trim();
            displayName = full || userDoc.username || userDoc.name || userDoc.email || displayName;
          }
        } catch (e) {
          // fallback to existing username
        }

        return {
          ...entry,
          problemStats,
          totalAttempts: userSubmissions.length,
          correctSubmissions: userSubmissions.filter(s => s.status === 'accepted').length,
          wrongSubmissions: userSubmissions.filter(s => s.status === 'wrong_answer').length,
          displayName
        };
      })
    );

    res.json({
      contest: {
        id: contest.id,
        title: contest.title,
        startTime: contest.startTime,
        endTime: contest.endTime,
        totalProblems: contest.problems.length,
        totalPoints: contest.problems.reduce((sum, p) => sum + (p.points || 0), 0)
      },
      standings: detailedStandings
    });
  } catch (error) {
    console.error("Error fetching contest standings:", error);
    res.status(500).json({ message: "Failed to fetch contest standings" });
  }
});

// Get contest final results
router.get('/:contestId/results', protect, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = req.params.contestId;
    
    // Check if contest has ended
    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }
    
    const now = new Date();
    const endTime = new Date(contest.endTime);
    const hasEnded = now > endTime;
    if (!hasEnded) {
      // Allow fetching results but mark as provisional
    }
    
    // Generate final results
    const leaderboard = await contestStorage.generateLeaderboard(contestId);
    // Fetch participants to get registrationTime
    const participants = await contestStorage.getContestParticipants(contestId);
    const userIdToParticipant: Record<string, any> = {};
    for (const p of participants) {
      userIdToParticipant[p.userId] = p;
    }
    
    // Transform to results format with additional statistics
    const results = await Promise.all(
      leaderboard.map(async (entry) => {
        const submissions = await contestStorage.getParticipantSubmissions(contestId, entry.userId);
        
        // Calculate problem-specific results
        const problemResults: Record<string, any> = {};
        for (const problem of contest.problems) {
          const problemSubmissions = submissions.filter(s => s.problemId === problem.id);
          const bestSubmission = problemSubmissions
            .filter(s => s.status === 'accepted')
            .sort((a, b) => (b.points || 0) - (a.points || 0))[0];
          
          problemResults[problem.id] = {
            score: bestSubmission?.points || 0,
            attempts: problemSubmissions.length,
            bestRuntime: bestSubmission?.runtime || 0,
            bestMemory: bestSubmission?.memory || 0,
            status: bestSubmission?.status || 'not_attempted'
          };
        }
        
        // Calculate averages
        const acceptedSubmissions = submissions.filter(s => s.status === 'accepted');
        const averageRuntime = acceptedSubmissions.length > 0 
          ? acceptedSubmissions.reduce((sum, s) => sum + (s.runtime || 0), 0) / acceptedSubmissions.length 
          : 0;
        const averageMemory = acceptedSubmissions.length > 0 
          ? acceptedSubmissions.reduce((sum, s) => sum + (s.memory || 0), 0) / acceptedSubmissions.length 
          : 0;
        
        // Resolve participant name
        let displayName = entry.username || entry.userId;
        try {
          const userDoc = await contestStorage.getUser(entry.userId);
          if (userDoc) {
            const first = (userDoc.firstName || userDoc.given_name || '').toString().trim();
            const last = (userDoc.lastName || userDoc.family_name || '').toString().trim();
            const full = `${first} ${last}`.trim();
            displayName = full || userDoc.username || userDoc.name || userDoc.email || displayName;
          }
        } catch (e) {
          // fallback to existing username
        }

        // Compute accurate time spent from registration to last activity, clamped to contest end
        const participant = userIdToParticipant[entry.userId];
        const registrationTime = participant?.registrationTime ? new Date(participant.registrationTime as any) : null;
        const rawLast = entry.lastSubmissionTime ? new Date(entry.lastSubmissionTime as any) : null;
        const effectiveLast = rawLast ? new Date(Math.min(rawLast.getTime(), endTime.getTime())) : (hasEnded ? endTime : now);
        const timeSpentSeconds = registrationTime ? Math.max(0, Math.floor((effectiveLast.getTime() - registrationTime.getTime()) / 1000)) : 0;
        
        return {
          ...entry,
          averageRuntime,
          averageMemory,
          problemResults,
          displayName,
          submittedAt: entry.lastSubmissionTime,
          timeSpentSeconds
        };
      })
    );
    
    res.json(results);
  } catch (error) {
    console.error("Error generating contest results:", error);
    res.status(500).json({ message: "Failed to generate contest results" });
  }
});

// Get contest leaderboard
router.get('/:contestId/leaderboard', protect, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = req.params.contestId;
    const leaderboard = await contestStorage.generateLeaderboard(contestId);
    res.json(leaderboard);
  } catch (error) {
    console.error("Error generating leaderboard:", error);
    res.status(500).json({ message: "Failed to generate leaderboard" });
  }
});

// Get contest analytics
router.get('/:contestId/analytics', protect, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = req.params.contestId;
    const analytics = await contestStorage.getContestAnalytics(contestId);
    res.json(analytics);
  } catch (error) {
    console.error("Error fetching contest analytics:", error);
    res.status(500).json({ message: "Failed to fetch contest analytics" });
  }
});

// Get user progress in contest
router.get('/:contestId/progress', protect, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = req.params.contestId;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: "Contest not found" });
    }

    const submissions = await contestStorage.getParticipantSubmissions(contestId, userId);
    const participants = await contestStorage.getContestParticipants(contestId);
    const participant = participants.find(p => p.userId === userId);

    // Calculate progress (case-insensitive status) & restrict to problems in this contest
    const acceptedAll = new Set<string>(
      submissions
        .filter(s => s.status?.toLowerCase?.() === 'accepted')
        .map(s => s.problemId)
    );
    const contestProblemIds = new Set<string>(contest.problems.map(p => p.id));
    const acceptedInContest = new Set(Array.from(acceptedAll).filter(id => contestProblemIds.has(id)));

    const totalProblems = contest.problems.length;
    const solvedCount = Math.min(acceptedInContest.size, totalProblems);
    const totalPoints = contest.problems.reduce((sum, problem) => sum + (problem.points || 0), 0);
    const earnedPoints = contest.problems
      .filter(p => acceptedInContest.has(p.id))
      .reduce((sum, p) => sum + (p.points || 0), 0);

    // Calculate time remaining
    const now = new Date();
    const endTime = new Date(contest.endTime);
    const timeRemaining = Math.max(0, endTime.getTime() - now.getTime());

    res.json({
      contestId,
      userId,
      solvedProblems: Array.from(acceptedInContest),
      solvedCount,
      totalProblems,
      progress: (solvedCount / Math.max(1, totalProblems)) * 100,
      earnedPoints,
      totalPoints,
      timeRemaining,
      participant: participant || null,
      submissions: submissions.length,
      lastSubmission: submissions.length > 0 ? submissions[submissions.length - 1] : null
    });
  } catch (error) {
    console.error("Error fetching contest progress:", error);
    res.status(500).json({ message: "Failed to fetch contest progress" });
  }
});

// Get contest announcements
router.get('/:contestId/announcements', protect, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = req.params.contestId;
    const announcements = await contestStorage.getAnnouncements(contestId);
    res.json(announcements);
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({ message: "Failed to fetch announcements" });
  }
});

// Manually end contest endpoint
router.post('/:contestId/end', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if contest exists
    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if contest has already ended
    const now = new Date();
    const endTime = new Date(contest.endTime);
    
    if (now > endTime) {
      // Contest has already ended by time, update the end method
      await contestStorage.updateContestEndMethod(contestId, 'time_expired');
      return res.json({ 
        message: 'Contest has already ended by time',
        contestEndMethod: 'time_expired'
      });
    }

    // Manually end the contest
    const success = await contestStorage.updateContestEndMethod(contestId, 'manually_ended');
    
    if (success) {
      res.json({ 
        message: 'Contest ended successfully',
        contestEndMethod: 'manually_ended'
      });
    } else {
      res.status(500).json({ message: 'Failed to end contest' });
    }
  } catch (error) {
    console.error('Error ending contest:', error);
    res.status(500).json({ message: 'Failed to end contest', error: (error as any).message });
  }
});

// Check and update expired contests endpoint
router.post('/check-expired', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const result = await contestStorage.checkAndUpdateAllExpiredContests();
    
    res.json({ 
      message: 'Expired contests check completed',
      result
    });
  } catch (error) {
    console.error('Error checking expired contests:', error);
    res.status(500).json({ message: 'Failed to check expired contests', error: (error as any).message });
  }
});

// Auto-submit code without execution (for tab switching violations)
router.post('/:contestId/problems/:problemId/auto-submit', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId, problemId } = req.params;
    const { code, language } = req.body;
    const userId = req.user?.id;

    console.log(`[AUTO-SUBMIT] Auto-submission: contestId=${contestId}, problemId=${problemId}, userId=${userId}`);

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Verify registration
    const participants = await contestStorage.getContestParticipants(contestId);
    const isRegistered = participants.some(p => p.userId === userId);
    if (!isRegistered) {
      console.log(`[AUTO-SUBMIT] User ${userId} not registered for contest ${contestId}`);
      return res.status(403).json({ message: 'Must be registered for contest' });
    }

    console.log(`[AUTO-SUBMIT] User ${userId} is registered for contest ${contestId}`);

    // Get the problem to verify it exists
    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const problem = contest.problems?.find(p => p.id === problemId);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Create submission without execution - just save the code
    const submission = await contestStorage.submitSolution({
      contestId,
      problemId,
      userId,
      code,
      language,
      status: 'auto_submitted', // Special status for auto-submitted code
      runtime: 0,
      memory: 0,
      points: 0,
      submissionTime: new Date(),
      penalty: 0,
      isContestSubmission: true,
      testResults: [] // No test results for auto-submissions
    });

    console.log(`[AUTO-SUBMIT] Successfully auto-submitted solution: submissionId=${submission.id}, status=${submission.status}`);

    res.json({
      id: submission.id,
      problemId: submission.problemId,
      code: submission.code,
      language: submission.language,
      status: submission.status,
      runtime: submission.runtime,
      memory: submission.memory,
      submissionTime: submission.submissionTime,
      testResults: [],
      passedCount: 0,
      totalTestCases: 0,
      allPassed: false,
      points: 0,
      autoSubmitted: true
    });
  } catch (error) {
    console.error('Error auto-submitting solution:', error);
    res.status(500).json({ message: 'Failed to auto-submit solution', error: (error as any).message });
  }
});

// End contest for user due to tab switching
router.post('/:contestId/end-user', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { contestId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if contest exists
    const contest = await contestStorage.getContest(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if user is registered for the contest
    const participants = await contestStorage.getContestParticipants(contestId);
    const isRegistered = participants.some(p => p.userId === userId);
    
    if (!isRegistered) {
      return res.status(403).json({ message: 'Must be registered for contest' });
    }

    // Update the user's contest end method and disqualify them due to tab switching
    const endMethodSuccess = await contestStorage.updateParticipantContestEndMethod(contestId, userId, 'manually_ended');
    const disqualifySuccess = await contestStorage.disqualifyParticipant(contestId, userId, 'Excessive tab switching detected');
    
    if (endMethodSuccess && disqualifySuccess) {
      console.log(`[CONTEST] User ${userId} terminated and disqualified from contest ${contestId} due to tab switching`);
      res.json({ 
        message: 'Contest ended for user due to tab switching - user disqualified',
        contestEndMethod: 'manually_ended',
        isDisqualified: true,
        disqualificationReason: 'Excessive tab switching detected'
      });
    } else {
      console.error(`[CONTEST] Failed to properly terminate user ${userId} from contest ${contestId}. End method: ${endMethodSuccess}, Disqualify: ${disqualifySuccess}`);
      res.status(500).json({ message: 'Failed to end contest for user' });
    }
  } catch (error) {
    console.error('Error ending contest for user:', error);
    res.status(500).json({ message: 'Failed to end contest for user', error: (error as any).message });
  }
});

export default router;