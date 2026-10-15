export { createSession, getSession, getProgress, getRoadmapProgress, openExercise, checkExercise, submitAnswer, nextExercise, getExerciseInfo, getHint, getSolution, listCourses, migrateLegacySession } from './engine.js';
export type { Session, SessionOptions, CreateSessionOptions, ExerciseProgress, TrackProgress, CheckResult, MigrationResult } from './engine.js';
export { courses, registerCourse, getCourse, getExercise } from './courses.js';
export type { Course, Exercise, ExerciseMode, Finding } from './courses.js';
export { roadmap, ROADMAP_LESSON_COUNT } from './curriculum.js';
export { git, init, commit, write, read, status, isAncestor, existsRef, GitError } from './git.js';
