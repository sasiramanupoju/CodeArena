import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Calendar, Clock, Users, Trophy, Play, CheckCircle, Star, Award } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

interface Contest {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  duration: number;
  problems: any[];
  participants?: any[];
  status: 'upcoming' | 'active' | 'ended';
  isEnrolled?: boolean;
  participantCount?: number;
  userProgress?: {
    problemsSolved: number;
    rank: number;
  };
  contestEndMethod?: 'time_expired' | 'manually_ended' | null;
  participantContestEndMethod?: { [key: string]: 'manually_ended' | 'disqualified' | null };
}

export default function ContestsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'active' | 'ended'>('all');
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: contests, isLoading } = useQuery<Contest[]>({
    queryKey: ['/api/contests'],
    queryFn: async () => {
      const response = await fetch('/api/contests', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch contests');
      return response.json();
    },
  });

  const { data: enrollmentStatuses } = useQuery({
    queryKey: ['/api/contests/enrollment-statuses', contests],
    queryFn: async () => {
      if (!contests || contests.length === 0) return {};
      
      const statusPromises = contests.map(async (contest) => {
        try {
          const response = await fetch(`/api/contests/${contest.id}/participants/me`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            return { contestId: contest.id, status: data };
          } else {
            return { contestId: contest.id, status: null };
          }
        } catch (error) {
          return { contestId: contest.id, status: null };
        }
      });
      
      const results = await Promise.all(statusPromises);
      return results.reduce((acc, { contestId, status }) => {
        acc[contestId] = status;
        return acc;
      }, {} as Record<string, any>);
    },
    enabled: !!contests && contests.length > 0,
    staleTime: 30000,
  });

  const getContestStatus = (contest: Contest): 'upcoming' | 'active' | 'ended' => {
    const now = new Date();
    const startTime = new Date(contest.startTime);
    const endTime = new Date(contest.endTime);
    const userId = user?.id;

    console.log(`[CONTEST-STATUS] Contest: ${contest.title}`);
    console.log(`[CONTEST-STATUS] Now: ${now.toISOString()}`);
    console.log(`[CONTEST-STATUS] Start: ${startTime.toISOString()}`);
    console.log(`[CONTEST-STATUS] End: ${endTime.toISOString()}`);
    console.log(`[CONTEST-STATUS] Contest end method: ${contest.contestEndMethod}`);
    
    if (userId && contest.participantContestEndMethod?.[userId]) {
        console.log(`[CONTEST-STATUS] Contest ended for user ${userId} via participantContestEndMethod.`);
        return 'ended';
    }

    if (contest.contestEndMethod === 'manually_ended' || contest.contestEndMethod === 'time_expired') {
      if (now > endTime) {
        console.log(`[CONTEST-STATUS] Contest ended globally: ${contest.contestEndMethod} and past end time`);
        return 'ended';
      } else {
        console.log(`[CONTEST-STATUS] Contest was globally ended but rescheduled - ignoring global end method`);
      }
    }
    
    if (now > endTime) {
      console.log(`[CONTEST-STATUS] Contest has ended based on time`);
      return 'ended';
    }
    
    if (now < startTime) return 'upcoming';
    if (now >= startTime && now <= endTime) return 'active';
    
    console.log(`[CONTEST-STATUS] Fallback: marking contest as ended`);
    return 'ended';
  };

  const filteredContests = contests?.filter(contest => {
    console.log(`[CONTEST-DATA] Contest: ${contest.title}`);
    console.log(`[CONTEST-DATA] Start time: ${contest.startTime}`);
    console.log(`[CONTEST-DATA] End time: ${contest.endTime}`);
    console.log(`[CONTEST-DATA] Raw start: ${typeof contest.startTime} - ${contest.startTime}`);
    console.log(`[CONTEST-DATA] Raw end: ${typeof contest.endTime} - ${contest.endTime}`);
    
    const matchesSearch = contest.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          contest.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || getContestStatus(contest) === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const getStatusBadge = (status: 'upcoming' | 'active' | 'ended') => {
    switch (status) {
      case 'upcoming':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Upcoming</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
      case 'ended':
        return <Badge variant="outline" className="bg-gray-100 text-gray-800">Ended</Badge>;
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // ✅ FINAL FIX: The function now accepts the `finalStatus` directly.
  const handleContestClick = (contest: Contest, status: 'upcoming' | 'active' | 'ended') => {
    const enrollmentStatus = enrollmentStatuses?.[contest.id];
    const hasParticipated = enrollmentStatus && (
      enrollmentStatus.submissions?.length > 0 || 
      enrollmentStatus.contestEndMethod || 
      enrollmentStatus.isDisqualified
    );
    
    // The logic now correctly uses the definitive status passed into it.
    if (status === 'ended') {
      if (hasParticipated) {
        setLocation(`/contests/${contest.id}/results`);
      } else {
        toast({
          title: 'Contest Ended',
          description: 'This contest has ended. You can no longer participate.',
          variant: 'destructive',
        });
        return;
      }
    } else if (status === 'upcoming') {
      setLocation(`/contests/${contest.id}/details`);
    } else {
      setLocation(`/contests/${contest.id}/problems`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading contests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Coding Contests
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Discover and participate in exciting coding challenges
        </p>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search contests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'upcoming', 'active', 'ended'] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredContests
          .filter((contest) => {
            return true;
          })
          .sort((a, b) => {
            const aEnrolled = a.isEnrolled ?? a.participants?.some((p: any) => p.userId === user?.id) ?? false;
            const bEnrolled = b.isEnrolled ?? b.participants?.some((p: any) => p.userId === user?.id) ?? false;
            
            if (aEnrolled && !bEnrolled) return -1;
            if (!aEnrolled && bEnrolled) return 1;
            
            const statusPriority = { 'active': 3, 'upcoming': 2, 'ended': 1 };
            const aPriority = statusPriority[getContestStatus(a)] || 0;
            const bPriority = statusPriority[getContestStatus(b)] || 0;
            
            if (aPriority !== bPriority) return bPriority - aPriority;
            
            return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
          })
          .map((contest) => {
            const initialStatus = getContestStatus(contest);
            const isEnrolled = contest.isEnrolled ?? contest.participants?.some((p: any) => p.userId === user?.id) ?? false;
            const participantCount = contest.participantCount ?? contest.participants?.length ?? 0;
            
            const enrollmentStatus = enrollmentStatuses?.[contest.id];
            const hasParticipated = enrollmentStatus && (
              enrollmentStatus.submissions?.length > 0 || 
              enrollmentStatus.contestEndMethod || 
              enrollmentStatus.isDisqualified
            );

            const finalStatus = (initialStatus === 'active' && enrollmentStatus?.contestEndMethod) ? 'ended' : initialStatus;

            return (
              <Card key={contest.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">{contest.title}</CardTitle>
                      {getStatusBadge(finalStatus)}
                    </div>
                    {isEnrolled && (
                      <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                        Enrolled
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4 line-clamp-2">
                    {contest.description}
                  </CardDescription>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2" />
                      {formatDateTime(contest.startTime)}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="h-4 w-4 mr-2" />
                      {contest.duration} minutes
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="h-4 w-4 mr-2" />
                      {participantCount} participants
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Trophy className="h-4 w-4 mr-2" />
                      {contest.problems?.length || 0} problems
                    </div>
                    
                    {isEnrolled && contest.userProgress && (
                      <>
                        {contest.userProgress.problemsSolved > 0 && (
                          <div className="flex items-center text-sm text-green-600 font-medium">
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {contest.userProgress.problemsSolved} problems solved
                          </div>
                        )}
                        {contest.userProgress.rank > 0 && (
                          <div className="flex items-center text-sm text-purple-600 font-medium">
                            <Award className="h-4 w-4 mr-2" />
                            Rank #{contest.userProgress.rank}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      // ✅ FINAL FIX: The click handler now receives the correct `finalStatus`
                      onClick={() => handleContestClick(contest, finalStatus)}
                      className="flex-1"
                      variant={isEnrolled ? "default" : "outline"}
                      disabled={finalStatus === 'ended' && !hasParticipated}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {(() => {
                        if (finalStatus === 'ended') {
                          return hasParticipated ? 'View Results' : 'Contest Ended';
                        }
                        
                        if (finalStatus === 'upcoming') {
                          return isEnrolled ? 'View Details' : 'Join Contest';
                        }
                        
                        if (finalStatus === 'active') {
                          if (!isEnrolled) return 'Start Contest';
                          return hasParticipated ? 'Resume Contest' : 'Start Contest';
                        }
                        
                        return 'View Results';
                      })()}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      {filteredContests.length === 0 && (
        <div className="text-center py-12">
          <Trophy className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contests found</h3>
          <p className="text-gray-600">
            {searchTerm || statusFilter !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'No contests are available at the moment'}
          </p>
        </div>
      )}
    </div>
  );
}