import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AppError } from '../types/error';

export const statsController = {
  async getCourseStats(req: Request, res: Response): Promise<void> {
    const { courseId } = req.params;
    const { academicYear } = req.query as { academicYear: string };

    try {
      const result = await pool.query(
        `
        SELECT 
          c.code as "courseCode",
          c.name as "courseName",
          COALESCE(AVG(g.grade), 0) as "averageGrade",
          COALESCE(MIN(g.grade), 0) as "minGrade",
          COALESCE(MAX(g.grade), 0) as "maxGrade",
          COUNT(g.id) as "totalStudents",
          COALESCE(COUNT(CASE WHEN g.grade >= 10 THEN 1 END)::float / NULLIF(COUNT(*), 0)::float * 100, 0) as "successRate"
        FROM courses c
        LEFT JOIN grades g ON g.course_id = c.id AND g.academic_year = $2
        WHERE c.id = $1
        GROUP BY c.id, c.code, c.name
      `,
        [courseId, academicYear]
      );

      res.json(result.rows[0]);
    } catch (error) {
      throw new AppError(
        500,
        'Erreur lors de la récupération des statistiques du cours',
        'STATS_ERROR'
      );
    }
  },

  async getStudentSemesterStats(req: Request, res: Response): Promise<void> {
    const { studentId } = req.params;
    const { academicYear } = req.query as { academicYear: string };

    try {
      const result = await pool.query(
        `
        SELECT 
          g.semester,
          SUM(g.grade * c.credits) / SUM(c.credits) as "averageGrade",
          SUM(c.credits) as "totalCredits",
          SUM(CASE WHEN g.grade >= 10 THEN c.credits ELSE 0 END) as "validatedCredits",
          COUNT(DISTINCT c.id) as "coursesCount"
        FROM grades g
        JOIN courses c ON c.id = g.course_id
        WHERE g.student_id = $1 AND g.academic_year = $2
        GROUP BY g.semester
        ORDER BY g.semester
      `,
        [studentId, academicYear]
      );

      res.json(result.rows);
    } catch (error) {
      throw new AppError(
        500,
        "Erreur lors de la récupération des statistiques de l'étudiant",
        'STATS_ERROR'
      );
    }
  },

  async getGlobalStats(req: Request, res: Response): Promise<void> {
    const { academicYear } = req.query as { academicYear: string };

    try {
      const result = await pool.query(
        `
        WITH course_stats AS (
          SELECT 
            g.grade,
            c.credits,
            g.student_id,
            COUNT(CASE WHEN g.grade >= 10 THEN 1 END)::float / COUNT(*)::float * 100 as success_rate
          FROM courses c
          JOIN grades g ON g.course_id = c.id
          WHERE g.academic_year = $1
          GROUP BY g.grade, c.credits, g.student_id
        )
        SELECT 
          SUM(grade * credits) / SUM(credits) as "globalAverage",
          COUNT(DISTINCT student_id) as "totalStudents",
          COUNT(DISTINCT student_id) as "totalCourses",
          AVG(success_rate) as "averageSuccessRate"
        FROM course_stats
      `,
        [academicYear]
      );

      res.json(result.rows[0]);
    } catch (error) {
      throw new AppError(
        500,
        'Erreur lors de la récupération des statistiques globales',
        'STATS_ERROR'
      );
    }
  },

  async getStudentProgressStats(req: Request, res: Response): Promise<void> {
    const { studentId } = req.params;
    
    try {
      const result = await pool.query(
        `
        WITH semester_progression AS (
          SELECT 
            g.academic_year,
            g.semester,
            AVG(g.grade) as semester_average,
            LAG(AVG(g.grade)) OVER (ORDER BY g.academic_year, g.semester) as prev_semester_average
          FROM grades g
          WHERE g.student_id = $1
          GROUP BY g.academic_year, g.semester
          ORDER BY g.academic_year, g.semester
        )
        SELECT 
          academic_year,
          semester,
          semester_average,
          prev_semester_average,
          CASE 
            WHEN prev_semester_average IS NOT NULL 
            THEN semester_average - prev_semester_average 
            ELSE 0 
          END as progression
        FROM semester_progression
        `,
        [studentId]
      );

      res.json(result.rows);
    } catch (error) {
      throw new AppError(
        500,
        "Erreur lors de la récupération des statistiques de progression",
        'STATS_ERROR'
      );
    }
  },

  async getCourseDistribution(req: Request, res: Response): Promise<void> {
    const { courseId } = req.params;
    const { academicYear } = req.query as { academicYear: string };

    try {
      const result = await pool.query(
        `
        WITH grade_ranges AS (
          SELECT 
            CASE
              WHEN grade < 8 THEN '0-7'
              WHEN grade < 10 THEN '8-9'
              WHEN grade < 12 THEN '10-11'
              WHEN grade < 14 THEN '12-13'
              WHEN grade < 16 THEN '14-15'
              ELSE '16-20'
            END as range,
            COUNT(*) as count
          FROM grades
          WHERE course_id = $1 AND academic_year = $2
          GROUP BY range
        )
        SELECT 
          range,
          count,
          ROUND((count::float / SUM(count) OVER()) * 100, 2) as percentage
        FROM grade_ranges
        ORDER BY range
        `,
        [courseId, academicYear]
      );

      res.json(result.rows);
    } catch (error) {
      throw new AppError(
        500,
        "Erreur lors de la récupération de la distribution des notes",
        'STATS_ERROR'
      );
    }
  },

  async getTeacherStats(req: Request, res: Response): Promise<void> {
    const { teacherId } = req.params;
    const { academicYear } = req.query as { academicYear: string };

    try {
      const result = await pool.query(
        `
        SELECT 
          c.id as "courseId",
          c.name as "courseName",
          COUNT(DISTINCT g.student_id) as "studentCount",
          AVG(g.grade) as "averageGrade",
          COUNT(CASE WHEN g.grade >= 10 THEN 1 END)::float / COUNT(*)::float * 100 as "successRate",
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY g.grade) as "medianGrade"
        FROM courses c
        JOIN grades g ON g.course_id = c.id
        WHERE c.teacher_id = $1 AND g.academic_year = $2
        GROUP BY c.id, c.name
        ORDER BY c.name
        `,
        [teacherId, academicYear]
      );

      res.json(result.rows);
    } catch (error) {
      throw new AppError(
        500,
        "Erreur lors de la récupération des statistiques de l'enseignant",
        'STATS_ERROR'
      );
    }
  },

  async getSemesterComparison(req: Request, res: Response): Promise<void> {
    const { academicYear, semester } = req.query as { academicYear: string, semester: string };

    try {
      const result = await pool.query(
        `
        WITH current_stats AS (
          SELECT 
            c.id,
            c.name,
            AVG(g.grade) as current_avg,
            COUNT(CASE WHEN g.grade >= 10 THEN 1 END)::float / COUNT(*)::float * 100 as current_success
          FROM courses c
          JOIN grades g ON g.course_id = c.id
          WHERE g.academic_year = $1 AND g.semester = $2
          GROUP BY c.id, c.name
        ),
        previous_stats AS (
          SELECT 
            c.id,
            AVG(g.grade) as previous_avg,
            COUNT(CASE WHEN g.grade >= 10 THEN 1 END)::float / COUNT(*)::float * 100 as previous_success
          FROM courses c
          JOIN grades g ON g.course_id = c.id
          WHERE g.academic_year = $1::text::int - 1 AND g.semester = $2
          GROUP BY c.id
        )
        SELECT 
          cs.name as "courseName",
          ROUND(cs.current_avg::numeric, 2) as "currentAverage",
          ROUND(ps.previous_avg::numeric, 2) as "previousAverage",
          ROUND((cs.current_avg - ps.previous_avg)::numeric, 2) as "averageDifference",
          ROUND(cs.current_success::numeric, 2) as "currentSuccessRate",
          ROUND(ps.previous_success::numeric, 2) as "previousSuccessRate",
          ROUND((cs.current_success - ps.previous_success)::numeric, 2) as "successRateDifference"
        FROM current_stats cs
        LEFT JOIN previous_stats ps ON cs.id = ps.id
        ORDER BY cs.name
        `,
        [academicYear, semester]
      );

      res.json(result.rows);
    } catch (error) {
      throw new AppError(
        500,
        "Erreur lors de la comparaison des semestres",
        'STATS_ERROR'
      );
    }
  }
};
