#!/usr/bin/env python3
"""
CCK Timetable Excel Generator
Generates professional, student-style Excel timetables with weekly grid per semester
"""

import json
import sys
import re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def load_data():
    with open('courses.json', 'r') as f:
        courses = json.load(f)
    with open('study_plans.json', 'r') as f:
        study_plans = json.load(f)
    return courses, study_plans

def parse_time(time_str):
    if not time_str:
        return None
    match = re.match(r'^([A-Za-z,]+)\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)$', time_str)
    if not match:
        return None
    
    days_str = match.group(1)
    start_time = match.group(2)
    end_time = match.group(3)
    
    day_map = {'Su': 'Sunday', 'Sa': 'Saturday', 'Th': 'Thursday', 
               'M': 'Monday', 'T': 'Tuesday', 'W': 'Wednesday', 'F': 'Friday'}
    
    days = []
    remaining = days_str
    for pattern in ['Su', 'Sa', 'Th', 'M', 'T', 'W', 'F']:
        if pattern in remaining:
            days.append(day_map.get(pattern, pattern))
            remaining = remaining.replace(pattern, '')
    
    start_h, start_m = map(int, start_time.split(':'))
    end_h, end_m = map(int, end_time.split(':'))
    duration = (end_h * 60 + end_m) - (start_h * 60 + start_m)
    
    return {
        'days': days,
        'start': start_time,
        'end': end_time,
        'start_hour': start_h,
        'duration': duration,
        'original': time_str
    }

def create_timetable_excel(courses, study_plans, output_file='CCK_Timetables.xlsx'):
    wb = Workbook()
    
    # Colors for courses
    course_colors = [
        ('DBEAFE', '1E40AF'),  # Blue
        ('DCFCE7', '166534'),  # Green
        ('FEF3C7', '92400E'),  # Yellow
        ('F3E8FF', '7C3AED'),  # Purple
        ('FCE7F3', 'BE185D'),  # Pink
        ('FFEDD5', 'C2410C'),  # Orange
        ('E0E7FF', '4338CA'),  # Indigo
        ('CCFBF1', '0F766E'),  # Teal
    ]
    
    # Styles
    header_font = Font(bold=True, color='FFFFFF', size=11)
    header_fill = PatternFill('solid', fgColor='1F2937')
    title_font = Font(bold=True, color='B91C1C', size=16)
    sem_font = Font(bold=True, color='FFFFFF', size=12)
    sem_fill = PatternFill('solid', fgColor='374151')
    
    thin_border = Border(
        left=Side(style='thin', color='E5E7EB'),
        right=Side(style='thin', color='E5E7EB'),
        top=Side(style='thin', color='E5E7EB'),
        bottom=Side(style='thin', color='E5E7EB')
    )
    
    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left_align = Alignment(horizontal='left', vertical='center')
    
    # Course lookup
    course_map = {c['code']: c for c in courses}
    
    # Days of week
    days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']
    day_abbrev = {'Sunday': 'Sun', 'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu'}
    
    # Time slots (8 AM to 8 PM)
    time_slots = [f'{h:02d}:00' for h in range(8, 21)]
    
    wb.remove(wb.active)
    
    sheet_count = 0
    for major_name, major_data in study_plans.items():
        # Group courses by semester
        by_semester = {}
        for plan_course in major_data.get('courses', []):
            year = plan_course.get('year', 'Year 1')
            sem = plan_course.get('semester', 'Semester 1')
            sem_key = f"{year} - {sem}"
            if sem_key not in by_semester:
                by_semester[sem_key] = []
            
            code = plan_course.get('code', '')
            course_data = course_map.get(code, {})
            sections = course_data.get('sections', [{}])
            section = next((s for s in sections if s.get('time')), sections[0] if sections else {})
            time_info = parse_time(section.get('time', ''))
            
            by_semester[sem_key].append({
                'code': code,
                'name': plan_course.get('title', course_data.get('name', '')),
                'credits': plan_course.get('credits', 3),
                'time_info': time_info,
                'time_str': section.get('time', 'TBA'),
                'method': section.get('method', 'Lecture'),
                'instructor': section.get('instructor', 'TBA')
            })
        
        # Create sheet for each semester
        for sem_key in sorted(by_semester.keys()):
            sem_courses = by_semester[sem_key]
            if not sem_courses:
                continue
            
            # Sheet name (max 31 chars)
            short_major = major_name[:15].replace('BACHELOR-', 'B-').replace('DIPLOMA-', 'D-')
            short_sem = sem_key.replace('First Year', 'Y1').replace('Second Year', 'Y2').replace('Third Year', 'Y3').replace('Fourth Year', 'Y4').replace('Year ', 'Y').replace(' - Semester ', 'S')
            sheet_name = f"{short_major} {short_sem}"[:31]
            
            ws = wb.create_sheet(title=sheet_name)
            sheet_count += 1
            
            # Assign colors to courses
            color_map = {}
            for i, c in enumerate(sem_courses):
                color_map[c['code']] = course_colors[i % len(course_colors)]
            
            # Title
            ws.merge_cells('A1:G1')
            ws['A1'] = f'{major_name}'
            ws['A1'].font = title_font
            ws['A1'].alignment = center_align
            
            ws.merge_cells('A2:G2')
            ws['A2'] = f'{sem_key} - {len(sem_courses)} courses'
            ws['A2'].font = sem_font
            ws['A2'].fill = sem_fill
            ws['A2'].alignment = center_align
            
            # Weekly Grid Header (Row 4)
            ws.cell(row=4, column=1, value='Time').font = header_font
            ws.cell(row=4, column=1).fill = header_fill
            ws.cell(row=4, column=1).alignment = center_align
            ws.cell(row=4, column=1).border = thin_border
            
            for col, day in enumerate(days, 2):
                cell = ws.cell(row=4, column=col, value=day_abbrev[day])
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = center_align
                cell.border = thin_border
            
            # Build grid data
            grid_data = {day: {slot: [] for slot in time_slots} for day in days}
            for course in sem_courses:
                ti = course['time_info']
                if not ti:
                    continue
                for day in ti['days']:
                    if day in grid_data:
                        slot_key = f"{ti['start_hour']:02d}:00"
                        if slot_key in grid_data[day]:
                            grid_data[day][slot_key].append(course)
            
            # Grid rows
            for row_idx, slot in enumerate(time_slots, 5):
                hour = int(slot.split(':')[0])
                ampm = 'PM' if hour >= 12 else 'AM'
                display_hour = hour - 12 if hour > 12 else hour
                
                time_cell = ws.cell(row=row_idx, column=1, value=f'{display_hour}:00 {ampm}')
                time_cell.alignment = center_align
                time_cell.border = thin_border
                time_cell.fill = PatternFill('solid', fgColor='F9FAFB')
                time_cell.font = Font(size=9, color='6B7280')
                
                for col, day in enumerate(days, 2):
                    cell = ws.cell(row=row_idx, column=col)
                    cell.border = thin_border
                    cell.alignment = center_align
                    
                    cell_courses = grid_data[day][slot]
                    if cell_courses:
                        c = cell_courses[0]
                        bg_color, text_color = color_map[c['code']]
                        cell.value = f"{c['code']}\n{c['time_info']['start']}-{c['time_info']['end']}"
                        cell.fill = PatternFill('solid', fgColor=bg_color)
                        cell.font = Font(bold=True, size=9, color=text_color)
            
            # Course details table
            details_start = 5 + len(time_slots) + 2
            
            ws.cell(row=details_start, column=1, value='Course Details').font = Font(bold=True, size=12)
            
            headers = ['Code', 'Course Name', 'Schedule', 'Type', 'Instructor', 'Credits']
            for col, h in enumerate(headers, 1):
                cell = ws.cell(row=details_start + 1, column=col, value=h)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = center_align
                cell.border = thin_border
            
            total_credits = 0
            for i, c in enumerate(sem_courses):
                row = details_start + 2 + i
                bg_color, text_color = color_map[c['code']]
                
                code_cell = ws.cell(row=row, column=1, value=c['code'])
                code_cell.font = Font(bold=True, color=text_color)
                code_cell.fill = PatternFill('solid', fgColor=bg_color)
                code_cell.border = thin_border
                
                ws.cell(row=row, column=2, value=c['name']).border = thin_border
                ws.cell(row=row, column=3, value=c['time_str']).border = thin_border
                ws.cell(row=row, column=4, value=c['method']).border = thin_border
                ws.cell(row=row, column=5, value=c['instructor']).border = thin_border
                
                cr_cell = ws.cell(row=row, column=6, value=c['credits'])
                cr_cell.alignment = center_align
                cr_cell.border = thin_border
                total_credits += c['credits']
            
            # Total row
            total_row = details_start + 2 + len(sem_courses)
            ws.cell(row=total_row, column=5, value='Total Credits:').font = Font(bold=True)
            ws.cell(row=total_row, column=6, value=total_credits).font = Font(bold=True, color='B91C1C', size=12)
            ws.cell(row=total_row, column=6).alignment = center_align
            
            # Column widths
            ws.column_dimensions['A'].width = 12
            ws.column_dimensions['B'].width = 14
            ws.column_dimensions['C'].width = 14
            ws.column_dimensions['D'].width = 14
            ws.column_dimensions['E'].width = 14
            ws.column_dimensions['F'].width = 10
            ws.column_dimensions['G'].width = 10
            
            # Row height for grid
            for r in range(5, 5 + len(time_slots)):
                ws.row_dimensions[r].height = 35
    
    # Summary sheet
    ws_summary = wb.create_sheet(title='Summary', index=0)
    ws_summary['A1'] = 'CCK Timetable Summary'
    ws_summary['A1'].font = title_font
    
    ws_summary['A3'] = 'Program'
    ws_summary['B3'] = 'Semesters'
    ws_summary['C3'] = 'Total Courses'
    for col in range(1, 4):
        ws_summary.cell(row=3, column=col).font = header_font
        ws_summary.cell(row=3, column=col).fill = header_fill
    
    row = 4
    for major_name, major_data in study_plans.items():
        by_sem = {}
        for c in major_data.get('courses', []):
            key = f"{c.get('year', '')} - {c.get('semester', '')}"
            by_sem[key] = by_sem.get(key, 0) + 1
        
        ws_summary.cell(row=row, column=1, value=major_name)
        ws_summary.cell(row=row, column=2, value=len(by_sem))
        ws_summary.cell(row=row, column=3, value=len(major_data.get('courses', [])))
        row += 1
    
    ws_summary.column_dimensions['A'].width = 40
    ws_summary.column_dimensions['B'].width = 12
    ws_summary.column_dimensions['C'].width = 15
    
    wb.save(output_file)
    print(f'Created {output_file} with {sheet_count} semester sheets')

if __name__ == '__main__':
    courses, study_plans = load_data()
    output = sys.argv[1] if len(sys.argv) > 1 else 'CCK_Timetables.xlsx'
    create_timetable_excel(courses, study_plans, output)
