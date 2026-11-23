// CCK SIS - Enrollment Prediction Module (Redesigned)
// Matches the design style of Student Management and other admin pages

// Grade point mapping
const GRADE_POINTS_MAP = {
    'A+': 4.0, 'A': 4.0, 'A-': 3.7,
    'B+': 3.3, 'B': 3.0, 'B-': 2.7,
    'C+': 2.3, 'C': 2.0, 'C-': 1.7,
    'D+': 1.3, 'D': 1.0, 'D-': 0.7,
    'F': 0.0, '(FA)': 0.0, '(W)': null, '(CR)': null, 'NP': null, 'NG': null
};

const PASSING_GRADES_LIST = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', '(CR)'];
const FAILING_GRADES_LIST = ['F', '(FA)'];

// Store for historical data
let HistoricalData = {
    records: [],
    courseStats: {},
    studentStats: {},
    loaded: false
};

// Current view state
let PredictionView = {
    currentTab: 'courses',
    searchTerm: '',
    filterConfidence: 'all',
    filterRisk: 'all'
};

// Load historical grades data
async function loadHistoricalGrades() {
    try {
        // Private data: comes from the database API and needs a login
        const res = await window.api.getHistoricalGrades();
        if (res.error) {
            console.log('Historical grades not loaded:', res.error.message);
            return false;
        }
        const data = res.data;
        
        HistoricalData.records = data.records || [];
        HistoricalData.courseStats = data.course_stats || {};
        HistoricalData.studentStats = data.student_stats || {};
        HistoricalData.loaded = true;
        
        console.log('Loaded historical data:', HistoricalData.records.length, 'records,', 
            Object.keys(HistoricalData.studentStats).length, 'students,', 
            Object.keys(HistoricalData.courseStats).length, 'courses');
        return true;
    } catch (error) {
        console.error('Failed to load historical grades:', error);
        return false;
    }
}

// Predict enrollment for a course
function predictCourseEnrollment(courseCode) {
    var stats = HistoricalData.courseStats[courseCode];
    
    if (!stats) {
        return {
            courseCode: courseCode,
            courseName: courseCode,
            newStudents: 0,
            repeatStudents: 0,
            totalPredicted: 0,
            confidence: 'low',
            passRate: 0,
            failRate: 0,
            factors: ['No historical data available']
        };
    }
    
    var total = stats.total || 0;
    var failed = stats.failed || 0;
    var passRate = stats.pass_rate || 0;
    var failRate = stats.fail_rate || 0;
    
    var estimatedNewStudents = Math.round(total * 0.9);
    var repeatStudents = failed;
    
    var confidence = 'low';
    if (total >= 20) confidence = 'high';
    else if (total >= 10) confidence = 'medium';
    
    return {
        courseCode: courseCode,
        courseName: stats.name || courseCode,
        newStudents: estimatedNewStudents,
        repeatStudents: repeatStudents,
        totalPredicted: estimatedNewStudents + repeatStudents,
        confidence: confidence,
        passRate: passRate,
        failRate: failRate,
        historical: total
    };
}

// Predict student progression
function predictStudentProgression() {
    var predictions = {
        progressing: [],
        repeating: [],
        atRisk: [],
        summary: { totalStudents: 0, progressing: 0, repeating: 0, atRisk: 0, progressionRate: 0 }
    };
    
    var studentEntries = Object.entries(HistoricalData.studentStats || {});
    
    for (var i = 0; i < studentEntries.length; i++) {
        var studentId = studentEntries[i][0];
        var stats = studentEntries[i][1];
        if (!stats) continue;
        
        var courses = stats.courses || [];
        var passed = stats.passed || 0;
        var failed = stats.failed || 0;
        var cgpa = stats.cgpa;
        
        var failedCourses = [];
        for (var j = 0; j < courses.length; j++) {
            var c = courses[j];
            if (c && FAILING_GRADES_LIST.indexOf(c.grade) !== -1) {
                failedCourses.push(c.code || 'Unknown');
            }
        }
        
        var student = {
            id: studentId,
            name: stats.name || 'Unknown',
            cgpa: cgpa,
            passed: passed,
            failed: failed,
            totalCourses: courses.length,
            failedCourses: failedCourses
        };
        
        if (failed === 0 && passed >= 3) {
            student.status = 'progressing';
            predictions.progressing.push(student);
        } else if (failed >= 3 || (cgpa !== null && cgpa !== undefined && cgpa < 1.5)) {
            student.status = 'at-risk';
            predictions.atRisk.push(student);
        } else if (failed > 0) {
            student.status = 'repeating';
            predictions.repeating.push(student);
        } else {
            student.status = 'progressing';
            predictions.progressing.push(student);
        }
    }
    
    var totalStudents = studentEntries.length || 1;
    predictions.summary = {
        totalStudents: totalStudents,
        progressing: predictions.progressing.length,
        repeating: predictions.repeating.length,
        atRisk: predictions.atRisk.length,
        progressionRate: Math.round(predictions.progressing.length / totalStudents * 100)
    };
    
    return predictions;
}

// Generate all course predictions
function generateEnrollmentPredictions() {
    var predictions = [];
    var courseEntries = Object.entries(HistoricalData.courseStats || {});
    
    for (var i = 0; i < courseEntries.length; i++) {
        var courseCode = courseEntries[i][0];
        var stats = courseEntries[i][1];
        if (!stats) continue;
        
        var total = stats.total || 0;
        var failed = stats.failed || 0;
        var estimatedNew = Math.round(total * 0.9);
        
        var confidence = 'low';
        if (total >= 20) confidence = 'high';
        else if (total >= 10) confidence = 'medium';
        
        predictions.push({
            courseCode: courseCode,
            courseName: stats.name || courseCode,
            newStudents: estimatedNew,
            repeatStudents: failed,
            totalPredicted: estimatedNew + failed,
            confidence: confidence,
            passRate: stats.pass_rate || 0,
            failRate: stats.fail_rate || 0,
            historical: total
        });
    }
    
    predictions.sort(function(a, b) { return b.totalPredicted - a.totalPredicted; });
    return predictions;
}

// Render prediction dashboard - main function
function renderPredictionDashboard(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
        console.error('Container not found:', containerId);
        return;
    }
    
    if (!HistoricalData.loaded) {
        container.innerHTML = '<div style="padding: 60px; text-align: center;"><div class="spinner" style="margin: 0 auto 16px;"></div><p style="color: #6B7280;">Loading historical data...</p></div>';
        loadHistoricalGrades().then(function() {
            renderPredictionDashboard(containerId);
        });
        return;
    }
    
    var studentPredictions = predictStudentProgression();
    var coursePredictions = generateEnrollmentPredictions();
    var semesterLabel = (typeof getSemesterLabel === 'function' && typeof AppState !== 'undefined') ? 
        getSemesterLabel(AppState.currentSemester || 'spring2026') : 'Spring 2026';
    
    // Calculate stats
    var highRiskCourses = [];
    var totalPredictedEnrollment = 0;
    var totalRepeatStudents = 0;
    
    for (var i = 0; i < coursePredictions.length; i++) {
        var c = coursePredictions[i];
        if (c.failRate > 30) highRiskCourses.push(c);
        totalPredictedEnrollment += c.totalPredicted;
        totalRepeatStudents += c.repeatStudents;
    }
    
    var newStudentsTotal = totalPredictedEnrollment - totalRepeatStudents;
    var newStudentsPct = totalPredictedEnrollment > 0 ? Math.round((newStudentsTotal / totalPredictedEnrollment) * 100) : 0;
    var repeatStudentsPct = totalPredictedEnrollment > 0 ? Math.round((totalRepeatStudents / totalPredictedEnrollment) * 100) : 0;
    
    // Build mini chart bars
    var chartBars = '';
    var heights = [65, 78, 45, 89, 56, 92, 73, 85, 67, 95, 82, 88];
    for (var i = 0; i < heights.length; i++) {
        var color = (i === 11) ? '#2563EB' : '#BFDBFE';
        chartBars += '<div style="flex: 1; height: ' + heights[i] + '%; background: ' + color + '; border-radius: 2px;"></div>';
    }
    
    // Build the HTML
    var html = '';
    
    // Stats Row
    html += '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 24px;">';
    
    // Card 1: Students Analyzed
    html += '<div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">';
    html += '<div style="display: flex; justify-content: space-between; align-items: flex-start;">';
    html += '<div>';
    html += '<div style="font-size: 13px; color: #6B7280; margin-bottom: 8px; font-weight: 500;">Students Analyzed</div>';
    html += '<div style="font-size: 36px; font-weight: 700; color: #3B82F6; line-height: 1;">' + studentPredictions.summary.totalStudents + '</div>';
    html += '<div style="font-size: 12px; color: #22C55E; margin-top: 8px;">' + studentPredictions.summary.progressionRate + '% progressing</div>';
    html += '</div>';
    html += '<div style="width: 56px; height: 56px; background: linear-gradient(135deg, #DBEAFE, #BFDBFE); border-radius: 12px; display: flex; align-items: center; justify-content: center;">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" style="width: 28px; height: 28px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    html += '</div></div>';
    html += '<div style="display: flex; gap: 3px; margin-top: 16px; height: 32px; align-items: flex-end;">' + chartBars + '</div>';
    html += '</div>';
    
    // Card 2: Status Distribution
    html += '<div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">';
    html += '<div style="font-size: 13px; color: #6B7280; margin-bottom: 12px; font-weight: 500;">Student Status Distribution</div>';
    html += '<div style="display: flex; align-items: center; gap: 20px;">';
    html += '<div style="position: relative; width: 80px; height: 80px;">';
    html += '<svg viewBox="0 0 36 36" style="width: 80px; height: 80px; transform: rotate(-90deg);">';
    html += '<circle cx="18" cy="18" r="15.915" fill="none" stroke="#E5E7EB" stroke-width="3"/>';
    html += '<circle cx="18" cy="18" r="15.915" fill="none" stroke="#22C55E" stroke-width="3" stroke-dasharray="' + studentPredictions.summary.progressionRate + ' ' + (100 - studentPredictions.summary.progressionRate) + '" stroke-linecap="round"/>';
    html += '</svg>';
    html += '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">';
    html += '<div style="font-size: 14px; font-weight: 700; color: #1F2937;">' + studentPredictions.summary.progressionRate + '%</div>';
    html += '</div></div>';
    html += '<div style="flex: 1;">';
    html += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;"><div style="width: 10px; height: 10px; background: #22C55E; border-radius: 2px;"></div><span style="font-size: 12px; color: #6B7280;">Progressing</span><span style="font-size: 12px; font-weight: 600; color: #1F2937; margin-left: auto;">' + studentPredictions.summary.progressing + '</span></div>';
    html += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;"><div style="width: 10px; height: 10px; background: #F59E0B; border-radius: 2px;"></div><span style="font-size: 12px; color: #6B7280;">Repeating</span><span style="font-size: 12px; font-weight: 600; color: #1F2937; margin-left: auto;">' + studentPredictions.summary.repeating + '</span></div>';
    html += '<div style="display: flex; align-items: center; gap: 8px;"><div style="width: 10px; height: 10px; background: #EF4444; border-radius: 2px;"></div><span style="font-size: 12px; color: #6B7280;">At Risk</span><span style="font-size: 12px; font-weight: 600; color: #1F2937; margin-left: auto;">' + studentPredictions.summary.atRisk + '</span></div>';
    html += '</div></div></div>';
    
    // Card 3: Predicted Enrollment
    html += '<div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">';
    html += '<div style="font-size: 13px; color: #6B7280; margin-bottom: 12px; font-weight: 500;">Predicted Enrollment</div>';
    html += '<div style="margin-bottom: 10px;">';
    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="font-size: 12px; color: #6B7280;">New Students</span><span style="font-size: 12px; font-weight: 600; color: #3B82F6;">' + newStudentsTotal + '</span></div>';
    html += '<div style="height: 6px; background: #F3F4F6; border-radius: 3px; overflow: hidden;"><div style="height: 100%; width: ' + newStudentsPct + '%; background: #3B82F6; border-radius: 3px;"></div></div>';
    html += '</div>';
    html += '<div>';
    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="font-size: 12px; color: #6B7280;">Repeat Students</span><span style="font-size: 12px; font-weight: 600; color: #F59E0B;">' + totalRepeatStudents + '</span></div>';
    html += '<div style="height: 6px; background: #F3F4F6; border-radius: 3px; overflow: hidden;"><div style="height: 100%; width: ' + repeatStudentsPct + '%; background: #F59E0B; border-radius: 3px;"></div></div>';
    html += '</div>';
    html += '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #E5E7EB;">';
    html += '<div style="font-size: 24px; font-weight: 700; color: #1F2937;">' + totalPredictedEnrollment + '</div>';
    html += '<div style="font-size: 11px; color: #6B7280;">Total Predicted</div>';
    html += '</div></div>';
    
    // Card 4: Course Risk Analysis
    html += '<div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">';
    html += '<div style="font-size: 13px; color: #6B7280; margin-bottom: 12px; font-weight: 500;">Course Risk Analysis</div>';
    html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">';
    html += '<div style="background: #FEF2F2; border-radius: 8px; padding: 12px; text-align: center;"><div style="font-size: 20px; font-weight: 700; color: #DC2626;">' + highRiskCourses.length + '</div><div style="font-size: 11px; color: #991B1B;">High Risk</div></div>';
    html += '<div style="background: #F0FDF4; border-radius: 8px; padding: 12px; text-align: center;"><div style="font-size: 20px; font-weight: 700; color: #16A34A;">' + (coursePredictions.length - highRiskCourses.length) + '</div><div style="font-size: 11px; color: #166534;">Normal</div></div>';
    html += '<div style="background: #EFF6FF; border-radius: 8px; padding: 12px; text-align: center;"><div style="font-size: 20px; font-weight: 700; color: #2563EB;">' + coursePredictions.length + '</div><div style="font-size: 11px; color: #1E40AF;">Total Courses</div></div>';
    html += '<div style="background: #FEF3C7; border-radius: 8px; padding: 12px; text-align: center;"><div style="font-size: 20px; font-weight: 700; color: #D97706;">' + HistoricalData.records.length + '</div><div style="font-size: 11px; color: #92400E;">Records</div>' +
        (function () {
            var n = HistoricalData.records.filter(function (r) { return r.verification === 'unverified'; }).length;
            return n ? '<div title="2015-2020 grades that could not be fully confirmed from the exports" style="font-size: 10px; color: #92400E; margin-top: 2px;">incl. ' + n + ' unverified</div>' : '';
        })() + '</div>';
    html += '</div></div>';
    
    html += '</div>'; // End stats row
    
    // Main Content Panel
    html += '<div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">';
    
    // Header with Tabs
    html += '<div style="padding: 20px; border-bottom: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">';
    html += '<div><h3 style="font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">Enrollment Predictions</h3>';
    html += '<p style="font-size: 13px; color: #6B7280; margin: 0;">AI-powered predictions for ' + semesterLabel + '</p></div>';
    html += '<div style="display: flex; gap: 8px;">';
    
    var coursesActive = PredictionView.currentTab === 'courses';
    var atRiskActive = PredictionView.currentTab === 'at-risk';
    var repeatingActive = PredictionView.currentTab === 'repeating';
    
    html += '<button onclick="switchPredictionTab(\'courses\')" id="tab-courses" style="padding: 8px 16px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 13px; cursor: pointer; ' + (coursesActive ? 'background: #B91C1C; color: white; border-color: #B91C1C;' : 'background: white; color: #374151;') + '">Course Predictions</button>';
    html += '<button onclick="switchPredictionTab(\'at-risk\')" id="tab-at-risk" style="padding: 8px 16px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 13px; cursor: pointer; ' + (atRiskActive ? 'background: #B91C1C; color: white; border-color: #B91C1C;' : 'background: white; color: #374151;') + '">At-Risk Students</button>';
    html += '<button onclick="switchPredictionTab(\'repeating\')" id="tab-repeating" style="padding: 8px 16px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 13px; cursor: pointer; ' + (repeatingActive ? 'background: #B91C1C; color: white; border-color: #B91C1C;' : 'background: white; color: #374151;') + '">Repeating Courses</button>';
    html += '</div></div>';
    
    // Filters Row
    html += '<div style="padding: 16px 20px; background: #F9FAFB; border-bottom: 1px solid #E5E7EB;">';
    html += '<div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">';
    html += '<div style="flex: 1; min-width: 200px;"><input type="text" id="prediction-search" placeholder="Search courses or students..." style="width: 100%; padding: 10px 14px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 14px;" onkeyup="filterPredictions()"></div>';
    html += '<select id="prediction-confidence-filter" style="padding: 10px 14px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 14px; min-width: 140px;" onchange="filterPredictions()"><option value="all">All Confidence</option><option value="high">High Confidence</option><option value="medium">Medium Confidence</option><option value="low">Low Confidence</option></select>';
    html += '<select id="prediction-risk-filter" style="padding: 10px 14px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 14px; min-width: 140px;" onchange="filterPredictions()"><option value="all">All Risk Levels</option><option value="high">High Risk (&gt;30%)</option><option value="medium">Medium Risk (15-30%)</option><option value="low">Low Risk (&lt;15%)</option></select>';
    html += '<button onclick="resetPredictionFilters()" style="padding: 10px 16px; border: 1px solid #E5E7EB; border-radius: 6px; background: white; cursor: pointer;">Reset</button>';
    html += '<button onclick="openPredictionPopup()" style="padding: 10px 16px; border: none; border-radius: 6px; background: #B91C1C; color: white; cursor: pointer;">Full Report</button>';
    html += '</div></div>';
    
    // Table Controls
    html += '<div style="padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E5E7EB;">';
    html += '<div style="font-size: 13px; color: #6B7280;"><span id="prediction-count">' + coursePredictions.length + '</span> records</div>';
    html += '<div style="display: flex; gap: 8px; align-items: center;"><span style="font-size: 13px; color: #6B7280;">Show</span>';
    html += '<select id="prediction-per-page" style="padding: 6px 10px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 13px;" onchange="renderPredictionTable()"><option value="10">10</option><option value="25" selected>25</option><option value="50">50</option><option value="100">100</option></select></div>';
    html += '</div>';
    
    // Table Container
    html += '<div id="prediction-table-container" style="overflow-x: auto;"></div>';
    
    html += '</div>'; // End main panel
    
    container.innerHTML = html;
    renderPredictionTable();
}

// Switch between tabs
window.switchPredictionTab = function(tab) {
    PredictionView.currentTab = tab;
    
    // Update button styles
    var tabs = ['courses', 'at-risk', 'repeating'];
    for (var i = 0; i < tabs.length; i++) {
        var btn = document.getElementById('tab-' + tabs[i]);
        if (btn) {
            if (tabs[i] === tab) {
                btn.style.background = '#B91C1C';
                btn.style.color = 'white';
                btn.style.borderColor = '#B91C1C';
            } else {
                btn.style.background = 'white';
                btn.style.color = '#374151';
                btn.style.borderColor = '#E5E7EB';
            }
        }
    }
    
    renderPredictionTable();
};

// Render the table based on current tab
function renderPredictionTable() {
    var container = document.getElementById('prediction-table-container');
    if (!container) return;
    
    var perPageEl = document.getElementById('prediction-per-page');
    var searchEl = document.getElementById('prediction-search');
    var confEl = document.getElementById('prediction-confidence-filter');
    var riskEl = document.getElementById('prediction-risk-filter');
    
    var perPage = perPageEl ? parseInt(perPageEl.value) : 25;
    var searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
    var confidenceFilter = confEl ? confEl.value : 'all';
    var riskFilter = riskEl ? riskEl.value : 'all';
    
    if (PredictionView.currentTab === 'courses') {
        renderCourseTable(container, perPage, searchTerm, confidenceFilter, riskFilter);
    } else if (PredictionView.currentTab === 'at-risk') {
        renderAtRiskTable(container, perPage, searchTerm);
    } else if (PredictionView.currentTab === 'repeating') {
        renderRepeatingTable(container, perPage, searchTerm);
    }
}

// Render course predictions table
function renderCourseTable(container, perPage, searchTerm, confidenceFilter, riskFilter) {
    var predictions = generateEnrollmentPredictions();
    
    // Apply filters
    var filtered = [];
    for (var i = 0; i < predictions.length; i++) {
        var p = predictions[i];
        if (searchTerm && p.courseCode.toLowerCase().indexOf(searchTerm) === -1 && p.courseName.toLowerCase().indexOf(searchTerm) === -1) continue;
        if (confidenceFilter !== 'all' && p.confidence !== confidenceFilter) continue;
        if (riskFilter === 'high' && p.failRate <= 30) continue;
        if (riskFilter === 'medium' && (p.failRate < 15 || p.failRate > 30)) continue;
        if (riskFilter === 'low' && p.failRate >= 15) continue;
        filtered.push(p);
    }
    
    var countEl = document.getElementById('prediction-count');
    if (countEl) countEl.textContent = filtered.length;
    
    var html = '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="background: #F9FAFB;">';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Course Code</th>';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Course Name</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Historical</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Predicted</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Pass Rate</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Fail Rate</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Repeats</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Confidence</th>';
    html += '</tr></thead><tbody>';
    
    var displayCount = Math.min(filtered.length, perPage);
    for (var i = 0; i < displayCount; i++) {
        var pred = filtered[i];
        var failColor = pred.failRate > 30 ? '#DC2626' : (pred.failRate > 20 ? '#D97706' : '#16A34A');
        var failBg = pred.failRate > 30 ? '#FEE2E2' : (pred.failRate > 20 ? '#FEF3C7' : '#D1FAE5');
        var confColor = pred.confidence === 'high' ? '#16A34A' : (pred.confidence === 'medium' ? '#D97706' : '#6B7280');
        var confBg = pred.confidence === 'high' ? '#D1FAE5' : (pred.confidence === 'medium' ? '#FEF3C7' : '#F3F4F6');
        var displayName = pred.courseName.length > 35 ? pred.courseName.substring(0, 35) + '...' : pred.courseName;
        
        html += '<tr style="border-bottom: 1px solid #F3F4F6;">';
        html += '<td style="padding: 12px 16px;"><strong style="color: #1F2937;">' + pred.courseCode + '</strong></td>';
        html += '<td style="padding: 12px 16px; font-size: 13px; color: #6B7280;">' + displayName + '</td>';
        html += '<td style="padding: 12px 16px; text-align: center;">' + pred.historical + '</td>';
        html += '<td style="padding: 12px 16px; text-align: center;"><span style="font-weight: 600; color: #2563EB;">' + pred.totalPredicted + '</span><div style="font-size: 10px; color: #6B7280;">' + pred.newStudents + ' new + ' + pred.repeatStudents + ' repeat</div></td>';
        html += '<td style="padding: 12px 16px; text-align: center;"><span style="background: #D1FAE5; color: #16A34A; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;">' + pred.passRate + '%</span></td>';
        html += '<td style="padding: 12px 16px; text-align: center;"><span style="background: ' + failBg + '; color: ' + failColor + '; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;">' + pred.failRate + '%</span></td>';
        html += '<td style="padding: 12px 16px; text-align: center;"><span style="background: #FEF3C7; color: #D97706; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">' + pred.repeatStudents + '</span></td>';
        html += '<td style="padding: 12px 16px; text-align: center;"><span style="background: ' + confBg + '; color: ' + confColor + '; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; text-transform: uppercase;">' + pred.confidence + '</span></td>';
        html += '</tr>';
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Render at-risk students table
function renderAtRiskTable(container, perPage, searchTerm) {
    var studentPredictions = predictStudentProgression();
    var students = studentPredictions.atRisk;
    
    var filtered = [];
    for (var i = 0; i < students.length; i++) {
        var s = students[i];
        if (searchTerm && s.id.toLowerCase().indexOf(searchTerm) === -1 && s.name.toLowerCase().indexOf(searchTerm) === -1) continue;
        filtered.push(s);
    }
    
    var countEl = document.getElementById('prediction-count');
    if (countEl) countEl.textContent = filtered.length;
    
    var html = '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="background: #F9FAFB;">';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Student ID</th>';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Name</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">CGPA</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Passed</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Failed</th>';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Failed Courses</th>';
    html += '</tr></thead><tbody>';
    
    var displayCount = Math.min(filtered.length, perPage);
    for (var i = 0; i < displayCount; i++) {
        var student = filtered[i];
        var cgpaColor = (student.cgpa && student.cgpa < 1.5) ? '#DC2626' : (student.cgpa && student.cgpa < 2.0 ? '#D97706' : '#16A34A');
        var cgpaBg = (student.cgpa && student.cgpa < 1.5) ? '#FEE2E2' : (student.cgpa && student.cgpa < 2.0 ? '#FEF3C7' : '#D1FAE5');
        var cgpaVal = student.cgpa ? student.cgpa.toFixed(2) : 'N/A';
        var failedCourses = (student.failedCourses || []).slice(0, 4).join(', ');
        var more = (student.failedCourses || []).length > 4 ? ' +' + ((student.failedCourses || []).length - 4) + ' more' : '';
        
        html += '<tr style="border-bottom: 1px solid #F3F4F6;">';
        html += '<td style="padding: 12px 16px;"><strong style="color: #1F2937;">' + student.id + '</strong></td>';
        html += '<td style="padding: 12px 16px; font-size: 13px; color: #6B7280;">' + student.name + '</td>';
        html += '<td style="padding: 12px 16px; text-align: center;"><span style="background: ' + cgpaBg + '; color: ' + cgpaColor + '; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">' + cgpaVal + '</span></td>';
        html += '<td style="padding: 12px 16px; text-align: center; color: #16A34A; font-weight: 600;">' + student.passed + '</td>';
        html += '<td style="padding: 12px 16px; text-align: center; color: #DC2626; font-weight: 600;">' + student.failed + '</td>';
        html += '<td style="padding: 12px 16px; font-size: 12px; color: #6B7280;">' + failedCourses + more + '</td>';
        html += '</tr>';
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Render repeating students table
function renderRepeatingTable(container, perPage, searchTerm) {
    var studentPredictions = predictStudentProgression();
    var students = studentPredictions.repeating;
    
    var filtered = [];
    for (var i = 0; i < students.length; i++) {
        var s = students[i];
        if (searchTerm && s.id.toLowerCase().indexOf(searchTerm) === -1 && s.name.toLowerCase().indexOf(searchTerm) === -1) continue;
        filtered.push(s);
    }
    
    var countEl = document.getElementById('prediction-count');
    if (countEl) countEl.textContent = filtered.length;
    
    var html = '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="background: #F9FAFB;">';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Student ID</th>';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Name</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">CGPA</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Passed</th>';
    html += '<th style="padding: 12px 16px; text-align: center; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Failed</th>';
    html += '<th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">Courses to Repeat</th>';
    html += '</tr></thead><tbody>';
    
    var displayCount = Math.min(filtered.length, perPage);
    for (var i = 0; i < displayCount; i++) {
        var student = filtered[i];
        var cgpaVal = student.cgpa ? student.cgpa.toFixed(2) : 'N/A';
        var failedCourses = (student.failedCourses || []).join(', ');
        
        html += '<tr style="border-bottom: 1px solid #F3F4F6;">';
        html += '<td style="padding: 12px 16px;"><strong style="color: #1F2937;">' + student.id + '</strong></td>';
        html += '<td style="padding: 12px 16px; font-size: 13px; color: #6B7280;">' + student.name + '</td>';
        html += '<td style="padding: 12px 16px; text-align: center;"><span style="background: #DBEAFE; color: #2563EB; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">' + cgpaVal + '</span></td>';
        html += '<td style="padding: 12px 16px; text-align: center; color: #16A34A; font-weight: 600;">' + student.passed + '</td>';
        html += '<td style="padding: 12px 16px; text-align: center; color: #F59E0B; font-weight: 600;">' + student.failed + '</td>';
        html += '<td style="padding: 12px 16px; font-size: 12px; color: #6B7280;">' + failedCourses + '</td>';
        html += '</tr>';
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Filter predictions
window.filterPredictions = function() {
    renderPredictionTable();
};

// Reset filters
window.resetPredictionFilters = function() {
    var searchEl = document.getElementById('prediction-search');
    var confEl = document.getElementById('prediction-confidence-filter');
    var riskEl = document.getElementById('prediction-risk-filter');
    if (searchEl) searchEl.value = '';
    if (confEl) confEl.value = 'all';
    if (riskEl) riskEl.value = 'all';
    renderPredictionTable();
};

// Open full report popup
function openPredictionPopup() {
    if (!HistoricalData.loaded) {
        alert('Please wait for data to load...');
        return;
    }
    
    var studentPredictions = predictStudentProgression();
    var courseEntries = Object.entries(HistoricalData.courseStats || {});
    courseEntries.sort(function(a, b) { return (b[1].total || 0) - (a[1].total || 0); });
    
    // Build course rows
    var courseRows = '';
    for (var i = 0; i < courseEntries.length; i++) {
        var code = courseEntries[i][0];
        var stats = courseEntries[i][1];
        var pred = predictCourseEnrollment(code);
        var failClass = (stats.fail_rate || 0) > 30 ? 'badge-red' : 'badge-yellow';
        courseRows += '<tr>';
        courseRows += '<td style="font-weight: 600;">' + code + '</td>';
        courseRows += '<td>' + (stats.name || '') + '</td>';
        courseRows += '<td style="text-align: center;">' + (stats.total || 0) + '</td>';
        courseRows += '<td style="text-align: center;"><span class="badge badge-green">' + (stats.pass_rate || 0) + '%</span></td>';
        courseRows += '<td style="text-align: center;"><span class="badge ' + failClass + '">' + (stats.fail_rate || 0) + '%</span></td>';
        courseRows += '<td style="text-align: center; color: #10B981; font-weight: 600;">' + (stats.passed || 0) + '</td>';
        courseRows += '<td style="text-align: center; color: #EF4444; font-weight: 600;">' + (stats.failed || 0) + '</td>';
        courseRows += '<td style="text-align: center;"><span class="badge badge-yellow">' + pred.repeatStudents + '</span></td>';
        courseRows += '<td style="text-align: center;"><span class="badge badge-purple">' + pred.totalPredicted + '</span></td>';
        courseRows += '</tr>';
    }
    
    // Build at-risk rows
    var atRiskRows = '';
    for (var i = 0; i < studentPredictions.atRisk.length; i++) {
        var s = studentPredictions.atRisk[i];
        var cgpaClass = (s.cgpa && s.cgpa < 1.5) ? 'badge-red' : 'badge-yellow';
        var cgpaVal = s.cgpa ? s.cgpa.toFixed(2) : 'N/A';
        var failedCourses = (s.failedCourses || []).slice(0, 3).join(', ');
        var more = (s.failedCourses || []).length > 3 ? '...' : '';
        atRiskRows += '<tr>';
        atRiskRows += '<td style="font-weight: 600;">' + s.id + '</td>';
        atRiskRows += '<td>' + (s.name || 'Unknown') + '</td>';
        atRiskRows += '<td style="text-align: center;"><span class="badge ' + cgpaClass + '">' + cgpaVal + '</span></td>';
        atRiskRows += '<td style="text-align: center; color: #10B981;">' + (s.passed || 0) + '</td>';
        atRiskRows += '<td style="text-align: center; color: #EF4444; font-weight: 600;">' + (s.failed || 0) + '</td>';
        atRiskRows += '<td style="font-size: 11px; color: #6B7280;">' + failedCourses + more + '</td>';
        atRiskRows += '</tr>';
    }
    
    var popupHTML = '<!DOCTYPE html><html><head><title>CCK - Enrollment Prediction Report</title>';
    popupHTML += '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';
    popupHTML += '<style>';
    popupHTML += '* { margin: 0; padding: 0; box-sizing: border-box; }';
    popupHTML += 'body { font-family: Inter, sans-serif; background: #F3F4F6; padding: 20px; }';
    popupHTML += '.container { max-width: 1400px; margin: 0 auto; }';
    popupHTML += '.header { background: linear-gradient(135deg, #1F2937, #374151); color: white; padding: 30px; border-radius: 16px; margin-bottom: 24px; }';
    popupHTML += '.header h1 { font-size: 28px; margin-bottom: 8px; }';
    popupHTML += '.header p { opacity: 0.8; }';
    popupHTML += '.card { background: white; border-radius: 12px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }';
    popupHTML += '.card-header { padding: 16px 20px; border-bottom: 1px solid #E5E7EB; font-weight: 600; font-size: 16px; }';
    popupHTML += 'table { width: 100%; border-collapse: collapse; font-size: 13px; }';
    popupHTML += 'th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #F3F4F6; }';
    popupHTML += 'th { background: #F9FAFB; font-weight: 600; color: #374151; position: sticky; top: 0; }';
    popupHTML += '.badge { padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }';
    popupHTML += '.badge-green { background: #D1FAE5; color: #059669; }';
    popupHTML += '.badge-red { background: #FEE2E2; color: #DC2626; }';
    popupHTML += '.badge-yellow { background: #FEF3C7; color: #D97706; }';
    popupHTML += '.badge-purple { background: #EDE9FE; color: #7C3AED; }';
    popupHTML += '.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }';
    popupHTML += '.stat-card { background: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }';
    popupHTML += '.stat-value { font-size: 36px; font-weight: 700; color: #1F2937; }';
    popupHTML += '.stat-label { font-size: 14px; color: #6B7280; margin-top: 4px; }';
    popupHTML += '.scroll-table { max-height: 500px; overflow-y: auto; }';
    popupHTML += '</style></head><body>';
    popupHTML += '<div class="container">';
    popupHTML += '<div class="header"><h1>CCK Enrollment Prediction Report</h1><p>Generated on ' + new Date().toLocaleString() + '</p></div>';
    popupHTML += '<div class="stats-grid">';
    popupHTML += '<div class="stat-card"><div class="stat-value" style="color: #10B981;">' + studentPredictions.summary.progressing + '</div><div class="stat-label">Progressing</div></div>';
    popupHTML += '<div class="stat-card"><div class="stat-value" style="color: #F59E0B;">' + studentPredictions.summary.repeating + '</div><div class="stat-label">Repeating</div></div>';
    popupHTML += '<div class="stat-card"><div class="stat-value" style="color: #EF4444;">' + studentPredictions.summary.atRisk + '</div><div class="stat-label">At Risk</div></div>';
    popupHTML += '<div class="stat-card"><div class="stat-value" style="color: #6366F1;">' + studentPredictions.summary.progressionRate + '%</div><div class="stat-label">Progression Rate</div></div>';
    popupHTML += '</div>';
    popupHTML += '<div class="card"><div class="card-header">Course Pass/Fail Analysis</div><div class="scroll-table"><table><thead><tr>';
    popupHTML += '<th>Code</th><th>Name</th><th>Historical</th><th>Pass Rate</th><th>Fail Rate</th><th>Passed</th><th>Failed</th><th>Repeats</th><th>Predicted</th>';
    popupHTML += '</tr></thead><tbody>' + courseRows + '</tbody></table></div></div>';
    popupHTML += '<div class="card"><div class="card-header" style="background:#FEF2F2;color:#991B1B;">At-Risk Students (' + studentPredictions.atRisk.length + ')</div><div class="scroll-table"><table><thead><tr><th>ID</th><th>Name</th><th>CGPA</th><th>Passed</th><th>Failed</th><th>Failed Courses</th></tr></thead><tbody>' + atRiskRows + '</tbody></table></div></div>';
    popupHTML += '</div></body></html>';
    
    var popup = window.open('', 'PredictionReport', 'width=1400,height=900,scrollbars=yes,resizable=yes');
    popup.document.write(popupHTML);
    popup.document.close();
}

// Export functions to window
if (typeof window !== 'undefined') {
    window.loadHistoricalGrades = loadHistoricalGrades;
    window.predictCourseEnrollment = predictCourseEnrollment;
    window.predictStudentProgression = predictStudentProgression;
    window.generateEnrollmentPredictions = generateEnrollmentPredictions;
    window.renderPredictionDashboard = renderPredictionDashboard;
    window.openPredictionPopup = openPredictionPopup;
    window.HistoricalData = HistoricalData;
}