export type ProjectStage = 'idea' | 'build' | 'test' | 'launch' | 'grow';
export type ProjectStatus = 'active' | 'paused' | 'blocked';

export interface Project {
  id: string;
  name: string;
  stage: ProjectStage;
  nextAction: string;
  status: ProjectStatus;
  lastProgress?: any; // Firestore Timestamp
  uid: string;
}

export interface Decision {
  id: string;
  title: string;
  context?: string;
  outcome?: string;
  timestamp: any; // Firestore Timestamp
  uid: string;
}

export interface Priority {
  id: string;
  text: string;
  completed: boolean;
  date: string; // YYYY-MM-DD
  uid: string;
}

export type Role = 'CEO' | 'Project Manager' | 'Developer' | 'Marketing';

export interface RoleSuggestion {
  role: Role;
  suggestion: string;
}
