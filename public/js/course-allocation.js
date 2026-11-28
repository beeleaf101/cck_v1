// CCK — Course Allocation v6 (Rebuilt)
// Improvements:
//   • Redesigned Enrollment Forecast modal — tabbed, spacious, readable
//   • Pass/fail rate per course used in enrollment prediction
//   • Full data flow: HOD → Reg1 → Reg2 → Facility
//   • Instructor availability from Reg2 (timeFrom/timeTo) enforced in scheduler
//   • Conflict-free room + instructor booking
//   • Zero emojis
(function () { 'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  BASE DATA  (historical, from Excel imports)
// ─────────────────────────────────────────────────────────────────────────────
const CA_COURSES_BASE = {"ACC0012":{"code":"ACC0012","name":"Business Project","credits":4,"contact_hours":4,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":4,"past_enrollment":10},"ACC0014":{"code":"ACC0014","name":"Accounting for Small Businesses","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":12},"ACC2201":{"code":"ACC2201","name":"Financial Accounting I","credits":5,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":5,"lab_hrs_per_week":0,"past_enrollment":79},"ACC2202":{"code":"ACC2202","name":"Financial Accounting II","credits":5,"contact_hours":5,"session_type":"lecture","lecture_hrs_per_week":5,"lab_hrs_per_week":0,"past_enrollment":9},"ACC2209":{"code":"ACC2209","name":"Financial Accounting III","credits":5,"contact_hours":5,"session_type":"lecture","lecture_hrs_per_week":5,"lab_hrs_per_week":0,"past_enrollment":20},"ACC2211":{"code":"ACC2211","name":"Payroll and Compliance","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":2},"ACC2214":{"code":"ACC2214","name":"Financial Information for Marketing","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":6},"ACC2233":{"code":"ACC2233","name":"Management Accounting I","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":8},"ACC2234":{"code":"ACC2234","name":"Management Accounting II","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":7},"ACC2262":{"code":"ACC2262","name":"Introduction to Personal Taxation","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":17},"ACC2265":{"code":"ACC2265","name":"Audit Principles & Bus Issues","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":5},"ACC2343":{"code":"ACC2343","name":"Spreadsheet Applications","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":28},"ACC2385":{"code":"ACC2385","name":"Accounting Software Applications","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":34},"BUAC3005":{"code":"BUAC3005","name":"Intermediate Accounting","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":14},"BUAC3050":{"code":"BUAC3050","name":"Accounting for Government and Not for Profit Organization","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":10},"BUAC3100":{"code":"BUAC3100","name":"Principles of Financial Accounting","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"BUAC3120":{"code":"BUAC3120","name":"Managerial Accounting","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":9},"BUAC3380":{"code":"BUAC3380","name":"Managerial Finance","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":1},"BUAC4120":{"code":"BUAC4120","name":"Financial Statement Presentation and Analysis","credits":2,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":2,"lab_hrs_per_week":1,"past_enrollment":0},"BUAC4380":{"code":"BUAC4380","name":"Intermediate Corporate Finance","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"BUAC4455":{"code":"BUAC4455","name":"Advanced Financial Accounting","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":4},"BUAC4720":{"code":"BUAC4720","name":"Cost Accounting","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":2},"BUAC4780":{"code":"BUAC4780","name":"Advanced Corporate Finance","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":2},"BUAD3090":{"code":"BUAD3090","name":"Business Law","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":16},"BUAD3091":{"code":"BUAD3091","name":"Employment Law","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":15},"BUCO3005":{"code":"BUCO3005","name":"Management Information Systems","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":10},"BUCO3160":{"code":"BUCO3160","name":"Information Technology for Business","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":0},"BUEN3025":{"code":"BUEN3025","name":"Enterprise Development and Business Planning","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":6},"BUEN3100":{"code":"BUEN3100","name":"Business Analysis and Decision Making","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":7},"BUEN3230":{"code":"BUEN3230","name":"Supply Chain & Logistics Management","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"BUEN4150":{"code":"BUEN4150","name":"Management of Innovation","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":6},"BUEN4200":{"code":"BUEN4200","name":"Business Strategy","credits":3,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":0},"BUEN4250":{"code":"BUEN4250","name":"Entrepreneurial Leadership Practicum I","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":13},"BUEN4251":{"code":"BUEN4251","name":"Entrepreneurial Leadership Practicum II","credits":2,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":2,"lab_hrs_per_week":1,"past_enrollment":4},"BUHR4120":{"code":"BUHR4120","name":"HR Management for Entrepreneurs","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":12},"BUMG3015":{"code":"BUMG3015","name":"Organizational Behaviour","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"BUMG3105":{"code":"BUMG3105","name":"Operations Management","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":14},"BUMG3110":{"code":"BUMG3110","name":"Advanced Organizational Behaviour","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":12},"BUMK3099":{"code":"BUMK3099","name":"Introduction to Marketing","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":13},"BUMT3030":{"code":"BUMT3030","name":"Business Statistics","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":15},"BUS2301":{"code":"BUS2301","name":"Business Comp Apps","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":138},"CSIT3014":{"code":"CSIT3014","name":"Discrete Mathematics for Information Technology","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":24},"CSIT3111":{"code":"CSIT3111","name":"Advanced Networking Technologies","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":20},"CSIT3115":{"code":"CSIT3115","name":"Data Structure","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":20},"CSIT3211":{"code":"CSIT3211","name":"Foundations of Computer Security","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":0},"CSIT3216":{"code":"CSIT3216","name":"Server Operating Systems","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":0},"CSIT3225":{"code":"CSIT3225","name":"Introduction to Programming with Python","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":0},"CSIT3235":{"code":"CSIT3235","name":"Software Quality Assurance","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":0},"CSIT3271":{"code":"CSIT3271","name":"System Security","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":8},"CSIT3280":{"code":"CSIT3280","name":"Information Technology Project Management","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":22},"CSIT3345":{"code":"CSIT3345","name":"Advanced Web Application Development","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":20},"CSIT4105":{"code":"CSIT4105","name":"Search Engine Principles","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":6},"CSIT4125":{"code":"CSIT4125","name":"Website & Cloud Security","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":0},"CSIT4190":{"code":"CSIT4190","name":"Integration Project I","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":8},"CSIT4235":{"code":"CSIT4235","name":"Special Topics in Web & Mobile App Development","credits":2,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":2,"lab_hrs_per_week":1,"past_enrollment":0},"CSIT4290":{"code":"CSIT4290","name":"Integration Project II","credits":3,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":0},"CSIT4330":{"code":"CSIT4330","name":"Data Warehousing and Data Mining","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":24},"CST2234":{"code":"CST2234","name":"Systems Analysis and Design","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":14},"CST2335":{"code":"CST2335","name":"Mobile Graphical Interface Programming","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":16},"CST2355":{"code":"CST2355","name":"Database Systems","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":20},"CST8101":{"code":"CST8101","name":"Computer Essentials","credits":3,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":78},"CST8102":{"code":"CST8102","name":"Oper System Fundamentals (GNU/Linux)","credits":4,"contact_hours":5,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":18},"CST8109":{"code":"CST8109","name":"Network Programming","credits":4,"contact_hours":5,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":20},"CST8116":{"code":"CST8116","name":"Introduction to Comp. Programming","credits":4,"contact_hours":5,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":80},"CST8117":{"code":"CST8117","name":"Cross-Platform Design","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":31},"CST8209":{"code":"CST8209","name":"Web Programming","credits":3,"contact_hours":3,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":3,"past_enrollment":25},"CST8215":{"code":"CST8215","name":"Intro to Database","credits":5,"contact_hours":5,"session_type":"lecture+lab","lecture_hrs_per_week":5,"lab_hrs_per_week":1,"past_enrollment":72},"CST8254":{"code":"CST8254","name":"Network Operating Systems","credits":3,"contact_hours":3,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":3,"past_enrollment":1},"CST8256":{"code":"CST8256","name":"Web Programming Languages","credits":3,"contact_hours":3,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":3,"past_enrollment":2},"CST8259":{"code":"CST8259","name":"Web Programming Languages II","credits":3,"contact_hours":3,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":3,"past_enrollment":1},"CST8260":{"code":"CST8260","name":"Database Systems and Concepts","credits":3,"contact_hours":3,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":3,"past_enrollment":35},"CST8265":{"code":"CST8265","name":"Web Security Basics","credits":3,"contact_hours":3,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":3,"past_enrollment":1},"CST8276":{"code":"CST8276","name":"Advanced Database Topics","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":24},"CST8277":{"code":"CST8277","name":"Enterprise Application Programming","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":8},"CST8279":{"code":"CST8279","name":"Intro to Comp Programming using Python","credits":3,"contact_hours":3,"session_type":"lab","lecture_hrs_per_week":0,"lab_hrs_per_week":3,"past_enrollment":35},"CST8283":{"code":"CST8283","name":"Business Programming","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":28},"CST8284":{"code":"CST8284","name":"Object-Oriented Programming (Java)","credits":4,"contact_hours":5,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":18},"CST8285":{"code":"CST8285","name":"Web Programming","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":24},"CST8288":{"code":"CST8288","name":"Obj-Orient Pgm with Dsgn Patterns","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":16},"CST8300":{"code":"CST8300","name":"Achieving Success in Changing Environment","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":36},"CST8333":{"code":"CST8333","name":"Programming Language Research Project","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":20},"CST8334":{"code":"CST8334","name":"Software Development Project","credits":4,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":18},"ECO2200":{"code":"ECO2200","name":"Economic Issues","credits":4,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":23},"ENL001":{"code":"ENL001","name":"English for Foundation 1","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":5},"ENL002":{"code":"ENL002","name":"English for Foundation 2","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":155},"ENL1813":{"code":"ENL1813","name":"Communications I","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":109},"ENL1823":{"code":"ENL1823","name":"Communications II","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":30},"FIN2230":{"code":"FIN2230","name":"Business Finance","credits":4,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":18},"GECU4100":{"code":"GECU4100","name":"Technologies, Cultures & Societies","credits":1,"contact_hours":2,"session_type":"lecture+lab","lecture_hrs_per_week":1,"lab_hrs_per_week":1,"past_enrollment":4},"GED0022":{"code":"GED0022","name":"Positive Psychology","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":14},"GED2234":{"code":"GED2234","name":"Contemporary Ethical Issues","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":8},"GEEC3150":{"code":"GEEC3150","name":"Principles of Microeconomics","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":18},"GEEC3250":{"code":"GEEC3250","name":"Principles of Macroeconomics","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"GEN2003":{"code":"GEN2003","name":"Healthy Lifestyle","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":49},"GEPH3033":{"code":"GEPH3033","name":"Professional Integrity & Ethics","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":12},"ICT001":{"code":"ICT001","name":"Computer Skills for Foundation 1","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":5},"ICT002":{"code":"ICT002","name":"Computer Skills for Foundation 2","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":155},"LAW1702":{"code":"LAW1702","name":"Business Law","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":7},"MAT001":{"code":"MAT001","name":"Core Math for Foundation 1","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":5},"MAT002":{"code":"MAT002","name":"Core Math for Foundation 2","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":155},"MAT8001":{"code":"MAT8001","name":"Technical Maths for Computer Science","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":50},"MGT2008":{"code":"MGT2008","name":"Business Plan Applied","credits":3,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":5},"MGT2201":{"code":"MGT2201","name":"Business Fundamentals","credits":4,"contact_hours":3,"session_type":"lecture+lab","lecture_hrs_per_week":4,"lab_hrs_per_week":1,"past_enrollment":88},"MGT2202":{"code":"MGT2202","name":"Emerging Technology for Business","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":6},"MGT2203":{"code":"MGT2203","name":"Financial Mgmt for Small Businesses","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":5},"MGT2204":{"code":"MGT2204","name":"Social Innovation","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":10},"MGT2223":{"code":"MGT2223","name":"Career Preparation for Entrepreneurs","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"MGT2224":{"code":"MGT2224","name":"Managing for Business Success","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":5},"MGT2225":{"code":"MGT2225","name":"Project Mgmt for Business Start-ups","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":9},"MGT2228":{"code":"MGT2228","name":"Global Entrepreneurship","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"MGT2232":{"code":"MGT2232","name":"Entrepreneurship & Innovation","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":22},"MKT0018":{"code":"MKT0018","name":"Marketing for Mgmt & Entrep","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":18},"MKT0019":{"code":"MKT0019","name":"Marketing Research","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":6},"MKT2205":{"code":"MKT2205","name":"Marketing Foundations","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":3},"MKT2207":{"code":"MKT2207","name":"Marketing Channels","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":3},"MKT2208":{"code":"MKT2208","name":"Digital Marketing","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":2},"MKT2213":{"code":"MKT2213","name":"Skills for the Workplace","credits":2,"contact_hours":2,"session_type":"lecture","lecture_hrs_per_week":2,"lab_hrs_per_week":0,"past_enrollment":7},"MKT2216":{"code":"MKT2216","name":"Skills Transferable to Bus","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":16},"MKT2218":{"code":"MKT2218","name":"Digital Marketing","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":6},"MKT2260":{"code":"MKT2260","name":"Industry Marketing Plan","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":2},"MKT2261":{"code":"MKT2261","name":"Mktg Plan Project Field Work","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":2},"MKT2283":{"code":"MKT2283","name":"Sales Management","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":5},"MKT2285":{"code":"MKT2285","name":"Marketing Research","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":3},"MKT2291":{"code":"MKT2291","name":"Integrated Marketing Communications I","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":6},"MKT2292":{"code":"MKT2292","name":"Integrated Marketing Communications II","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":2},"QUA0002":{"code":"QUA0002","name":"Basic Mathematics","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":9},"QUA0008":{"code":"QUA0008","name":"Statistics","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":3},"QUA2210":{"code":"QUA2210","name":"Business Mathematics","credits":4,"contact_hours":4,"session_type":"lecture","lecture_hrs_per_week":4,"lab_hrs_per_week":0,"past_enrollment":66},"RET2213":{"code":"RET2213","name":"eCommerce","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":7},"RET2214":{"code":"RET2214","name":"Retail Management","credits":3,"contact_hours":4,"session_type":"lecture+lab","lecture_hrs_per_week":3,"lab_hrs_per_week":1,"past_enrollment":9},"RET2223":{"code":"RET2223","name":"Professional Selling","credits":3,"contact_hours":3,"session_type":"lecture","lecture_hrs_per_week":3,"lab_hrs_per_week":0,"past_enrollment":6}};

const CA_HISTORICAL = {"ACC0012":{"past_students":10,"past_sections":2,"avg_per_section":5,"pass_rate":0.70},"ACC0014":{"past_students":12,"past_sections":1,"avg_per_section":12,"pass_rate":0.80},"ACC2201":{"past_students":79,"past_sections":2,"avg_per_section":40,"pass_rate":0.72},"ACC2202":{"past_students":9,"past_sections":1,"avg_per_section":9,"pass_rate":0.75},"ACC2209":{"past_students":20,"past_sections":1,"avg_per_section":20,"pass_rate":0.75},"ACC2211":{"past_students":2,"past_sections":1,"avg_per_section":2,"pass_rate":0.80},"ACC2214":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.80},"ACC2233":{"past_students":8,"past_sections":1,"avg_per_section":8,"pass_rate":0.78},"ACC2234":{"past_students":7,"past_sections":1,"avg_per_section":7,"pass_rate":0.78},"ACC2262":{"past_students":17,"past_sections":1,"avg_per_section":17,"pass_rate":0.76},"ACC2265":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.75},"ACC2343":{"past_students":28,"past_sections":1,"avg_per_section":28,"pass_rate":0.82},"ACC2385":{"past_students":34,"past_sections":2,"avg_per_section":17,"pass_rate":0.79},"BUAC3005":{"past_students":14,"past_sections":1,"avg_per_section":14,"pass_rate":0.80},"BUAC3050":{"past_students":10,"past_sections":1,"avg_per_section":10,"pass_rate":0.82},"BUAC3100":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.80},"BUAC3120":{"past_students":9,"past_sections":1,"avg_per_section":9,"pass_rate":0.77},"BUAC3380":{"past_students":1,"past_sections":1,"avg_per_section":1,"pass_rate":0.75},"BUAC4120":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.75},"BUAC4380":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.74},"BUAC4455":{"past_students":4,"past_sections":1,"avg_per_section":4,"pass_rate":0.73},"BUAC4720":{"past_students":2,"past_sections":1,"avg_per_section":2,"pass_rate":0.74},"BUAC4780":{"past_students":2,"past_sections":1,"avg_per_section":2,"pass_rate":0.72},"BUAD3090":{"past_students":16,"past_sections":1,"avg_per_section":16,"pass_rate":0.82},"BUAD3091":{"past_students":15,"past_sections":1,"avg_per_section":15,"pass_rate":0.82},"BUCO3005":{"past_students":10,"past_sections":1,"avg_per_section":10,"pass_rate":0.80},"BUCO3160":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.80},"BUEN3025":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.83},"BUEN3100":{"past_students":7,"past_sections":1,"avg_per_section":7,"pass_rate":0.80},"BUEN3230":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.80},"BUEN4150":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.82},"BUEN4200":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.80},"BUEN4250":{"past_students":13,"past_sections":1,"avg_per_section":13,"pass_rate":0.84},"BUEN4251":{"past_students":4,"past_sections":1,"avg_per_section":4,"pass_rate":0.82},"BUHR4120":{"past_students":12,"past_sections":1,"avg_per_section":12,"pass_rate":0.83},"BUMG3015":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.80},"BUMG3105":{"past_students":14,"past_sections":1,"avg_per_section":14,"pass_rate":0.81},"BUMG3110":{"past_students":12,"past_sections":1,"avg_per_section":12,"pass_rate":0.81},"BUMK3099":{"past_students":13,"past_sections":1,"avg_per_section":13,"pass_rate":0.82},"BUMT3030":{"past_students":15,"past_sections":1,"avg_per_section":15,"pass_rate":0.76},"BUS2301":{"past_students":138,"past_sections":4,"avg_per_section":34,"pass_rate":0.78},"CSIT3014":{"past_students":24,"past_sections":1,"avg_per_section":24,"pass_rate":0.70},"CSIT3111":{"past_students":20,"past_sections":1,"avg_per_section":20,"pass_rate":0.74},"CSIT3115":{"past_students":20,"past_sections":1,"avg_per_section":20,"pass_rate":0.68},"CSIT3211":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.75},"CSIT3216":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.75},"CSIT3225":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.76},"CSIT3235":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.75},"CSIT3271":{"past_students":8,"past_sections":1,"avg_per_section":8,"pass_rate":0.72},"CSIT3280":{"past_students":22,"past_sections":1,"avg_per_section":22,"pass_rate":0.76},"CSIT3345":{"past_students":20,"past_sections":1,"avg_per_section":20,"pass_rate":0.73},"CSIT4105":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.75},"CSIT4125":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.76},"CSIT4190":{"past_students":8,"past_sections":1,"avg_per_section":8,"pass_rate":0.78},"CSIT4235":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.75},"CSIT4290":{"past_students":0,"past_sections":1,"avg_per_section":0,"pass_rate":0.75},"CSIT4330":{"past_students":24,"past_sections":1,"avg_per_section":24,"pass_rate":0.74},"CST2234":{"past_students":14,"past_sections":2,"avg_per_section":7,"pass_rate":0.74},"CST2335":{"past_students":16,"past_sections":1,"avg_per_section":16,"pass_rate":0.72},"CST2355":{"past_students":20,"past_sections":1,"avg_per_section":20,"pass_rate":0.73},"CST8101":{"past_students":78,"past_sections":1,"avg_per_section":78,"pass_rate":0.80},"CST8102":{"past_students":18,"past_sections":2,"avg_per_section":9,"pass_rate":0.72},"CST8109":{"past_students":20,"past_sections":1,"avg_per_section":20,"pass_rate":0.74},"CST8116":{"past_students":80,"past_sections":2,"avg_per_section":40,"pass_rate":0.68},"CST8117":{"past_students":31,"past_sections":1,"avg_per_section":31,"pass_rate":0.76},"CST8209":{"past_students":25,"past_sections":1,"avg_per_section":25,"pass_rate":0.74},"CST8215":{"past_students":72,"past_sections":2,"avg_per_section":36,"pass_rate":0.70},"CST8254":{"past_students":1,"past_sections":1,"avg_per_section":1,"pass_rate":0.75},"CST8256":{"past_students":2,"past_sections":1,"avg_per_section":2,"pass_rate":0.75},"CST8259":{"past_students":1,"past_sections":1,"avg_per_section":1,"pass_rate":0.74},"CST8260":{"past_students":35,"past_sections":1,"avg_per_section":35,"pass_rate":0.73},"CST8265":{"past_students":1,"past_sections":1,"avg_per_section":1,"pass_rate":0.76},"CST8276":{"past_students":24,"past_sections":1,"avg_per_section":24,"pass_rate":0.72},"CST8277":{"past_students":8,"past_sections":1,"avg_per_section":8,"pass_rate":0.73},"CST8279":{"past_students":35,"past_sections":1,"avg_per_section":35,"pass_rate":0.74},"CST8283":{"past_students":28,"past_sections":1,"avg_per_section":28,"pass_rate":0.74},"CST8284":{"past_students":18,"past_sections":1,"avg_per_section":18,"pass_rate":0.70},"CST8285":{"past_students":24,"past_sections":1,"avg_per_section":24,"pass_rate":0.74},"CST8288":{"past_students":16,"past_sections":1,"avg_per_section":16,"pass_rate":0.72},"CST8300":{"past_students":36,"past_sections":2,"avg_per_section":18,"pass_rate":0.82},"CST8333":{"past_students":20,"past_sections":1,"avg_per_section":20,"pass_rate":0.74},"CST8334":{"past_students":18,"past_sections":1,"avg_per_section":18,"pass_rate":0.75},"ECO2200":{"past_students":23,"past_sections":1,"avg_per_section":23,"pass_rate":0.76},"ENL001":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.78},"ENL002":{"past_students":155,"past_sections":5,"avg_per_section":31,"pass_rate":0.75},"ENL1813":{"past_students":109,"past_sections":3,"avg_per_section":36,"pass_rate":0.79},"ENL1823":{"past_students":30,"past_sections":2,"avg_per_section":15,"pass_rate":0.80},"FIN2230":{"past_students":18,"past_sections":2,"avg_per_section":9,"pass_rate":0.76},"GECU4100":{"past_students":4,"past_sections":1,"avg_per_section":4,"pass_rate":0.84},"GED0022":{"past_students":14,"past_sections":1,"avg_per_section":14,"pass_rate":0.84},"GED2234":{"past_students":8,"past_sections":1,"avg_per_section":8,"pass_rate":0.82},"GEEC3150":{"past_students":18,"past_sections":2,"avg_per_section":9,"pass_rate":0.76},"GEEC3250":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.76},"GEN2003":{"past_students":49,"past_sections":2,"avg_per_section":24,"pass_rate":0.85},"GEPH3033":{"past_students":12,"past_sections":2,"avg_per_section":6,"pass_rate":0.84},"ICT001":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.82},"ICT002":{"past_students":155,"past_sections":5,"avg_per_section":31,"pass_rate":0.80},"LAW1702":{"past_students":7,"past_sections":1,"avg_per_section":7,"pass_rate":0.80},"MAT001":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.72},"MAT002":{"past_students":155,"past_sections":5,"avg_per_section":31,"pass_rate":0.68},"MAT8001":{"past_students":50,"past_sections":2,"avg_per_section":25,"pass_rate":0.65},"MGT2008":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.82},"MGT2201":{"past_students":88,"past_sections":2,"avg_per_section":44,"pass_rate":0.80},"MGT2202":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.82},"MGT2203":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.78},"MGT2204":{"past_students":10,"past_sections":1,"avg_per_section":10,"pass_rate":0.84},"MGT2223":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.82},"MGT2224":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.80},"MGT2225":{"past_students":9,"past_sections":1,"avg_per_section":9,"pass_rate":0.80},"MGT2228":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.80},"MGT2232":{"past_students":22,"past_sections":2,"avg_per_section":11,"pass_rate":0.82},"MKT0018":{"past_students":18,"past_sections":1,"avg_per_section":18,"pass_rate":0.82},"MKT0019":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.80},"MKT2205":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.80},"MKT2207":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.80},"MKT2208":{"past_students":2,"past_sections":1,"avg_per_section":1,"pass_rate":0.80},"MKT2213":{"past_students":7,"past_sections":1,"avg_per_section":7,"pass_rate":0.84},"MKT2216":{"past_students":16,"past_sections":1,"avg_per_section":16,"pass_rate":0.82},"MKT2218":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.80},"MKT2260":{"past_students":2,"past_sections":1,"avg_per_section":2,"pass_rate":0.80},"MKT2261":{"past_students":2,"past_sections":1,"avg_per_section":2,"pass_rate":0.80},"MKT2283":{"past_students":5,"past_sections":1,"avg_per_section":5,"pass_rate":0.80},"MKT2285":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.80},"MKT2291":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.80},"MKT2292":{"past_students":2,"past_sections":1,"avg_per_section":2,"pass_rate":0.80},"QUA0002":{"past_students":9,"past_sections":1,"avg_per_section":9,"pass_rate":0.72},"QUA0008":{"past_students":3,"past_sections":1,"avg_per_section":3,"pass_rate":0.73},"QUA2210":{"past_students":66,"past_sections":2,"avg_per_section":33,"pass_rate":0.70},"RET2213":{"past_students":7,"past_sections":1,"avg_per_section":7,"pass_rate":0.82},"RET2214":{"past_students":9,"past_sections":1,"avg_per_section":9,"pass_rate":0.80},"RET2223":{"past_students":6,"past_sections":1,"avg_per_section":6,"pass_rate":0.82}};

// Instructor preferences (from Reg2 timing slots — kept as fallback)
const CA_INST_PREFS={"INS001":{"lec_slots":[{"days":["Su","T","Th"],"start":"12:00","end":"12:50"},{"days":["M","W"],"start":"12:00","end":"13:15"},{"days":["W","Th"],"start":"10:30","end":"11:45"},{"days":["Su","T","Th"],"start":"09:00","end":"09:50"}],"lab_slots":[]},"INS002":{"lec_slots":[{"days":["Su","T","Th"],"start":"09:00","end":"09:50"},{"days":["M","W"],"start":"08:00","end":"09:00"},{"days":["Su","T"],"start":"11:00","end":"12:15"},{"days":["M","W"],"start":"15:00","end":"16:30"}],"lab_slots":[]},"INS003":{"lec_slots":[{"days":["M","W"],"start":"13:30","end":"14:45"},{"days":["Su"],"start":"12:30","end":"13:45"},{"days":["T"],"start":"09:00","end":"09:50"},{"days":["Th"],"start":"09:00","end":"09:50"}],"lab_slots":[{"days":["M"],"start":"15:00","end":"16:50"},{"days":["W"],"start":"15:00","end":"16:50"},{"days":["M"],"start":"11:30","end":"13:20"},{"days":["Th"],"start":"18:00","end":"19:50"}]},"INS004":{"lec_slots":[{"days":["T"],"start":"12:00","end":"12:50"},{"days":["Su","T","Th"],"start":"14:00","end":"14:50"},{"days":["M","W"],"start":"14:00","end":"15:30"},{"days":["T","Th"],"start":"09:00","end":"09:50"}],"lab_slots":[{"days":["M","W"],"start":"12:00","end":"13:50"},{"days":["Su","M","T","W"],"start":"08:00","end":"09:00"},{"days":["Th"],"start":"12:00","end":"13:50"},{"days":["Th"],"start":"17:30","end":"19:20"}]},"INS005":{"lec_slots":[{"days":["Su","M","T","W","Th"],"start":"14:30","end":"16:20"},{"days":["Su","T","Th"],"start":"11:00","end":"11:50"},{"days":["M","W"],"start":"12:00","end":"13:00"},{"days":["Su","T","Th"],"start":"10:00","end":"10:50"}],"lab_slots":[]},"INS006":{"lec_slots":[{"days":["W","Th"],"start":"15:00","end":"16:15"},{"days":["T","Th"],"start":"16:30","end":"17:45"},{"days":["T"],"start":"18:00","end":"19:50"},{"days":["Su","M"],"start":"16:00","end":"17:50"}],"lab_slots":[]},"INS007":{"lec_slots":[{"days":["T","Th"],"start":"10:00","end":"11:15"},{"days":["Th"],"start":"14:00","end":"15:50"},{"days":["W"],"start":"12:00","end":"12:50"},{"days":["M","W"],"start":"10:00","end":"10:50"}],"lab_slots":[{"days":["W"],"start":"11:00","end":"11:50"},{"days":["Th"],"start":"12:00","end":"13:50"},{"days":["Su"],"start":"13:00","end":"14:50"},{"days":["T","W"],"start":"15:00","end":"16:50"}]},"INS008":{"lec_slots":[{"days":["M","W"],"start":"11:30","end":"12:45"},{"days":["Su","T","Th"],"start":"19:00","end":"19:50"},{"days":["Th"],"start":"14:00","end":"15:50"},{"days":["T"],"start":"13:30","end":"15:20"}],"lab_slots":[{"days":["Su"],"start":"13:30","end":"14:20"},{"days":["Su"],"start":"19:00","end":"19:50"}]},"INS009":{"lec_slots":[{"days":["Su","T"],"start":"17:30","end":"18:45"},{"days":["M","W"],"start":"14:00","end":"15:50"},{"days":["Su","T","Th"],"start":"16:00","end":"17:05"},{"days":["M","W"],"start":"12:00","end":"13:15"}],"lab_slots":[]},"INS010":{"lec_slots":[{"days":["M","W"],"start":"09:30","end":"10:45"},{"days":["M","W"],"start":"13:30","end":"14:45"},{"days":["M","W"],"start":"12:00","end":"13:15"},{"days":["Su","T"],"start":"11:00","end":"11:50"}],"lab_slots":[]},"INS011":{"lec_slots":[{"days":["Su","T"],"start":"17:00","end":"18:15"},{"days":["Su","T"],"start":"10:30","end":"11:45"},{"days":["Su","T"],"start":"12:30","end":"13:45"},{"days":["Su","T"],"start":"15:30","end":"16:45"}],"lab_slots":[]},"INS012":{"lec_slots":[{"days":["M","W"],"start":"09:00","end":"10:50"},{"days":["Su","T","Th"],"start":"13:30","end":"14:50"},{"days":["Su","T","Th"],"start":"18:00","end":"18:50"},{"days":["Su","T","Th"],"start":"10:00","end":"11:05"}],"lab_slots":[{"days":["Th"],"start":"11:30","end":"13:20"}]},"INS013":{"lec_slots":[{"days":["Su","T"],"start":"14:00","end":"15:15"},{"days":["Su","T"],"start":"11:00","end":"12:15"}],"lab_slots":[]},"INS014":{"lec_slots":[{"days":["M"],"start":"16:00","end":"17:15"},{"days":["Su","M"],"start":"09:00","end":"10:15"},{"days":["T","Th"],"start":"16:00","end":"17:20"}],"lab_slots":[]},"INS015":{"lec_slots":[{"days":["Su","M","W"],"start":"11:00","end":"11:50"},{"days":["Su","M","T","W","Th"],"start":"12:00","end":"13:50"},{"days":["Su","M","T","W","Th"],"start":"09:00","end":"10:50"},{"days":["Su","T","Th"],"start":"14:00","end":"14:50"}],"lab_slots":[]},"INS016":{"lec_slots":[{"days":["M","W"],"start":"16:00","end":"17:15"},{"days":["M","W"],"start":"14:00","end":"15:50"},{"days":["M","W"],"start":"12:00","end":"12:50"}],"lab_slots":[]},"INS017":{"lec_slots":[{"days":["W"],"start":"10:00","end":"11:50"},{"days":["Th"],"start":"09:00","end":"10:50"},{"days":["M","W"],"start":"09:00","end":"09:50"},{"days":["M","W"],"start":"18:00","end":"18:50"}],"lab_slots":[{"days":["Su"],"start":"11:00","end":"11:50"},{"days":["T"],"start":"14:00","end":"14:50"},{"days":["Th"],"start":"11:00","end":"12:50"},{"days":["Su"],"start":"19:00","end":"19:50"}]},"INS018":{"lec_slots":[{"days":["T"],"start":"16:00","end":"17:50"},{"days":["M","W"],"start":"15:00","end":"16:15"},{"days":["M","W"],"start":"14:00","end":"14:50"}],"lab_slots":[{"days":["Su"],"start":"16:00","end":"16:50"},{"days":["Th"],"start":"14:00","end":"15:50"},{"days":["Su"],"start":"14:00","end":"15:50"}]},"INS019":{"lec_slots":[{"days":["Su"],"start":"13:00","end":"14:50"},{"days":["W"],"start":"13:00","end":"14:50"},{"days":["M"],"start":"15:00","end":"16:50"},{"days":["T","Th"],"start":"10:00","end":"10:50"}],"lab_slots":[{"days":["T"],"start":"15:00","end":"15:50"},{"days":["M"],"start":"13:00","end":"13:50"},{"days":["Th"],"start":"09:00","end":"09:50"},{"days":["Su"],"start":"10:00","end":"11:50"}]},"INS020":{"lec_slots":[{"days":["T"],"start":"12:00","end":"13:50"},{"days":["T"],"start":"10:00","end":"11:15"},{"days":["Su","T"],"start":"08:00","end":"09:00"},{"days":["M","W"],"start":"09:30","end":"10:45"}],"lab_slots":[{"days":["M"],"start":"11:00","end":"11:50"},{"days":["Th"],"start":"10:00","end":"11:50"},{"days":["Th"],"start":"18:00","end":"19:50"},{"days":["W"],"start":"14:00","end":"15:50"}]},"INS021":{"lec_slots":[{"days":["M","Th"],"start":"14:00","end":"15:15"},{"days":["M","W"],"start":"12:00","end":"13:15"},{"days":["T","Th"],"start":"10:30","end":"11:45"},{"days":["Su","T"],"start":"13:00","end":"14:15"}],"lab_slots":[]},"INS022":{"lec_slots":[{"days":["Su"],"start":"16:30","end":"18:20"}],"lab_slots":[{"days":["Su","Th"],"start":"16:30","end":"18:20"},{"days":["M"],"start":"10:00","end":"11:50"},{"days":["M","W"],"start":"15:00","end":"16:15"},{"days":["T"],"start":"16:30","end":"17:20"}]},"INS023":{"lec_slots":[{"days":["Su","M","T","W","Th"],"start":"09:30","end":"10:50"},{"days":["Su","M","T","W","Th"],"start":"12:30","end":"14:20"},{"days":["Su","M","T","W","Th"],"start":"14:30","end":"16:20"}],"lab_slots":[]},"INS024":{"lec_slots":[{"days":["T","Th"],"start":"09:30","end":"10:45"},{"days":["Su","T"],"start":"11:00","end":"12:15"},{"days":["M","W"],"start":"12:00","end":"13:15"},{"days":["Th"],"start":"13:00","end":"14:15"}],"lab_slots":[]}};

const CA_TIME_SLOTS={
  "lec_slots":[
    {"days":["Su","T"],"start":"08:00","end":"09:15","mins":75},{"days":["M","W"],"start":"08:00","end":"09:15","mins":75},
    {"days":["Su","T"],"start":"09:30","end":"10:45","mins":75},{"days":["M","W"],"start":"09:30","end":"10:45","mins":75},
    {"days":["Su","T"],"start":"11:00","end":"12:15","mins":75},{"days":["M","W"],"start":"11:00","end":"12:15","mins":75},
    {"days":["Su","T"],"start":"12:30","end":"13:45","mins":75},{"days":["M","W"],"start":"12:30","end":"13:45","mins":75},
    {"days":["Su","T"],"start":"14:00","end":"15:15","mins":75},{"days":["M","W"],"start":"14:00","end":"15:15","mins":75},
    {"days":["Su","T"],"start":"15:30","end":"16:45","mins":75},{"days":["M","W"],"start":"15:30","end":"16:45","mins":75},
    {"days":["Su","T","Th"],"start":"17:00","end":"17:50","mins":50},{"days":["Su","T","Th"],"start":"18:00","end":"18:50","mins":50},
    {"days":["T","Th"],"start":"09:00","end":"10:15","mins":75},{"days":["T","Th"],"start":"10:30","end":"11:45","mins":75},
    {"days":["T","Th"],"start":"12:00","end":"13:15","mins":75},{"days":["T","Th"],"start":"14:00","end":"15:15","mins":75},
    {"days":["T","Th"],"start":"15:30","end":"16:45","mins":75},{"days":["T","Th"],"start":"16:30","end":"17:45","mins":75}
  ],
  "lab_slots":[
    {"days":["M"],"start":"10:00","end":"11:50","mins":110},{"days":["T"],"start":"10:00","end":"11:50","mins":110},
    {"days":["W"],"start":"10:00","end":"11:50","mins":110},{"days":["Th"],"start":"10:00","end":"11:50","mins":110},
    {"days":["Su"],"start":"10:00","end":"11:50","mins":110},
    {"days":["M"],"start":"12:00","end":"13:50","mins":110},{"days":["T"],"start":"12:00","end":"13:50","mins":110},
    {"days":["W"],"start":"12:00","end":"13:50","mins":110},{"days":["Th"],"start":"12:00","end":"13:50","mins":110},
    {"days":["Su"],"start":"12:00","end":"13:50","mins":110},
    {"days":["M"],"start":"14:00","end":"15:50","mins":110},{"days":["T"],"start":"14:00","end":"15:50","mins":110},
    {"days":["W"],"start":"14:00","end":"15:50","mins":110},{"days":["Th"],"start":"14:00","end":"15:50","mins":110},
    {"days":["Su"],"start":"14:00","end":"15:50","mins":110},
    {"days":["M"],"start":"16:00","end":"17:50","mins":110},{"days":["T"],"start":"16:30","end":"18:20","mins":110},
    {"days":["W"],"start":"16:00","end":"17:50","mins":110},{"days":["Th"],"start":"16:00","end":"17:50","mins":110},
    {"days":["Th"],"start":"18:00","end":"19:50","mins":110},{"days":["T"],"start":"18:00","end":"19:50","mins":110}
  ]
};

const CAP = { lecture: 40, lab: 30 };
const LS_FORECAST = 'cck_alloc_forecast_v2';
const LS_OVR = 'cck_alloc_overrides_v1';
const LS_TT = 'cck_alloc_timetable_v1';
const DAYS = ['Su','M','T','W','Th'];
const DAYF = {Su:'Sunday',M:'Monday',T:'Tuesday',W:'Wednesday',Th:'Thursday'};

const PROGRAMS = [
  {key:'dp-cp',  label:'Diploma – Computer Programming',  dept:'cs'},
  {key:'dp-bme', label:'Diploma – Business (BME)',         dept:'biz'},
  {key:'dp-mktg',label:'Diploma – Business (Marketing)',   dept:'biz'},
  {key:'dp-acct',label:'Diploma – Accounting',             dept:'biz'},
  {key:'ba-cp',  label:'Bachelor – Computer Programming',  dept:'cs'},
  {key:'ba-bme', label:'Bachelor – Business (BME)',         dept:'biz'},
  {key:'ba-mktg',label:'Bachelor – Business (Marketing)',   dept:'biz'},
  {key:'ba-acct',label:'Bachelor – Accounting',             dept:'biz'},
];

// ─────────────────────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────────────────────
let S = {
  semKey: 'spring2026',
  assignments: {}, instData: {}, rooms: [], credits: {},
  forecast: {}, overrides: {},
  plan: null, timetable: null,
  filter: 'all', search: '',
  activeAlloc: null,
};

// ─────────────────────────────────────────────────────────────────────────────
//  BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const nav = sel => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener('click', () => setTimeout(() => {
      if (sel.includes('allocation')) initAlloc();
      else initTT();
    }, 60));
  };
  nav('[data-section="allocation"]');
  nav('[data-section="timetable"]');

  const obs = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(ms => ms.forEach(m => { if (m.target.classList.contains('active')) fn(); }))
      .observe(el, { attributes: true, attributeFilter: ['class'] });
  };
  obs('section-allocation', () => {
    if (!document.getElementById('ca-root')) { initAlloc(); }
    else { loadPortal(); S.plan = null; renderAlloc(); }
  });
  obs('section-timetable', () => { if (!document.getElementById('tt-root')) initTT(); });

  window.addEventListener('cck-sync-complete', () => {
    loadPortal();
    if (document.getElementById('ca-root')) { S.plan = null; renderAlloc(); }
    if (document.getElementById('tt-root')) renderTT();
  });
  window.addEventListener('cck-semester-changed', e => {
    S.semKey = e.detail.key; loadPortal(); loadForecast();
    S.plan = null; S.timetable = null;
    if (document.getElementById('ca-root')) renderAlloc();
    if (document.getElementById('tt-root')) renderTT();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  DATA LOADERS
// ─────────────────────────────────────────────────────────────────────────────
function loadPortal() {
  const sk = S.semKey;
  // HOD assignments
  const hodFlat = JSON.parse(localStorage.getItem('cck_hod_assignments') || '{}');
  const hodV3sk = ((JSON.parse(localStorage.getItem('cck_assignments_v3') || '{}')) || {})[sk] || {};
  S.assignments = Object.keys(hodFlat).length ? hodFlat : (Object.keys(hodV3sk).length ? hodV3sk : {});
  // Instructor data — HOD + Reg2
  const sh = JSON.parse(localStorage.getItem('cck_inst_shared') || '{}');
  const r2 = JSON.parse(localStorage.getItem('cck_reg2_inst') || '{}');
  S.instData = {};
  Object.entries(sh).forEach(([id, d]) => { S.instData[id] = { ...(d || {}) }; });
  Object.entries(r2).forEach(([id, d]) => { S.instData[id] = { ...(S.instData[id] || {}), ...(d || {}) }; });
  // Credits (Reg1)
  const cs = JSON.parse(localStorage.getItem('cck_credits_shared') || '{}');
  const cvsk = ((JSON.parse(localStorage.getItem('cck_credits_v3') || '{}')) || {})[sk] || {};
  S.credits = Object.keys(cs).length ? cs : (Object.keys(cvsk).length ? cvsk : {});
  // Rooms (Facility)
  const rsShared = JSON.parse(localStorage.getItem('cck_rooms_shared') || 'null');
  const rsApp = JSON.parse(localStorage.getItem('cck_app_rooms') || 'null');
  S.rooms = (rsShared && rsShared.length ? rsShared : null) || (rsApp && rsApp.length ? rsApp : null) || [];
}

function loadForecast() { S.forecast = JSON.parse(localStorage.getItem(LS_FORECAST) || '{}'); }
function loadOverrides() { S.overrides = JSON.parse(localStorage.getItem(LS_OVR) || '{}'); }

// ─────────────────────────────────────────────────────────────────────────────
//  ENROLLMENT PREDICTION ENGINE
//  Formula:
//    base = past_students for the course
//    fail_back = past_students * (1 - pass_rate)  // students who failed & re-enroll
//    new_share = new_students * course_weight      // new students from forecasted growth
//    projected = base + fail_back + new_share
// ─────────────────────────────────────────────────────────────────────────────
function predictEnrollment(code, hist, newStudents) {
  const base = hist.past_students || 0;
  const passRate = hist.pass_rate || 0.75;
  const failBack = Math.round(base * (1 - passRate)); // failed → retake
  let newShare = 0;
  if (newStudents > 0 && base > 0) {
    // weight by historical share of total student body (535 baseline)
    newShare = Math.round(newStudents * (base / 535) * 0.85);
  } else if (newStudents > 0) {
    newShare = Math.round(newStudents * 0.02);
  }
  const projected = base + failBack + newShare;
  return { projected, base, failBack, newShare, passRate };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PLAN BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildPlan() {
  const sk = S.semKey;
  const fc = S.forecast[sk] || {};
  const newStu = fc._total || 0;

  // Course → instructor(s) map from HOD
  const ci = {};
  Object.entries(S.assignments).forEach(([iid, codes]) =>
    (codes || []).forEach(c => (ci[c] = ci[c] || []).push(iid)));
  Object.entries(S.overrides).forEach(([c, iid]) => { if (iid) ci[c] = [iid]; });

  const seen = new Set(), plan = [];
  Object.values(CA_COURSES_BASE).forEach(course => {
    const code = course.code.trim();
    if (seen.has(code)) return;
    seen.add(code);
    const hist = CA_HISTORICAL[code] || { past_students: 0, past_sections: 1, pass_rate: 0.75 };
    const credits = S.credits[code] || course.credits;
    const isLab = course.session_type !== 'lecture';
    const cap = isLab ? CAP.lab : CAP.lecture;
    const { projected, base, failBack, newShare, passRate } = predictEnrollment(code, hist, newStu);
    const secs = projected > 0 ? Math.max(1, Math.ceil(projected / cap)) : (hist.past_sections || 1);
    const iids = ci[code] || ci[course.code] || [];
    const inames = iids.map(id => {
      const d = S.instData[id], b = { name: id };
      return (d && d.name) || b.name;
    });
    plan.push({
      code, credits, name: course.name.replace(/\n/g, ' ').trim(),
      session: course.session_type, chrs: course.contact_hours,
      lhrs: course.lecture_hrs_per_week, lahrs: course.lab_hrs_per_week,
      past: base, failBack, newShare, passRate, proj: projected, secs,
      iids, inames, assigned: iids.length > 0,
    });
  });
  plan.sort((a, b) => b.proj - a.proj);
  S.plan = plan;
  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SCHEDULING ENGINE
//  Respects:
//   • Instructor availability from Reg2 (timeFrom/timeTo) or pref slots
//   • Room type matching (lab → lab room, lecture → classroom)
//   • Conflict-free booking (instructor can't be double-booked)
//   • Room can't be double-booked at same time
// ─────────────────────────────────────────────────────────────────────────────
function runScheduler() {
  const plan = S.plan || buildPlan();
  const lecSlots = CA_TIME_SLOTS.lec_slots;
  const labSlots = CA_TIME_SLOTS.lab_slots;

  const syncLab = S.rooms.filter(r => (r.type || r.room_type) === 'lab')
    .map(r => String(r.id || r.room_id || r.name || '').trim()).filter(Boolean);
  const syncLec = S.rooms.filter(r => (r.type || r.room_type) !== 'lab')
    .map(r => String(r.id || r.room_id || r.name || '').trim()).filter(Boolean);
  const allLab = syncLab.length ? syncLab : ['Lab-A', 'Lab-B', 'Lab-C'];
  const allLec = syncLec.length ? syncLec : ['B2-023', 'B2-024', 'B2-025', 'B2-026', 'B2-027'];

  const roomBook = {}, instBook = {};
  const rk = (d, s, e, rm) => `${d}|${s}-${e}|${rm}`;
  const ik = (d, s, e, iid) => `${d}|${s}-${e}|I:${iid}`;
  const roomFree = (rm, sl) => sl.days.every(d => !roomBook[rk(d, sl.start, sl.end, rm)]);
  const instFree = (iid, sl) => !iid || sl.days.every(d => !instBook[ik(d, sl.start, sl.end, iid)]);
  const bookR = (rm, sl, lbl) => sl.days.forEach(d => { roomBook[rk(d, sl.start, sl.end, rm)] = lbl; });
  const bookI = (iid, sl, lbl) => { if (iid) sl.days.forEach(d => { instBook[ik(d, sl.start, sl.end, iid)] = lbl; }); };

  // Convert HH:MM to minutes
  const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // Check if a slot falls within instructor's declared availability window
  function instAllowsSlot(iid, sl) {
    if (!iid) return true;
    const d = S.instData[iid];
    if (!d || !d.timeFrom || !d.timeTo) return true; // no restriction set → allow all
    const fromM = toMins(d.timeFrom);
    const toM = toMins(d.timeTo);
    const slFrom = toMins(sl.start);
    const slTo = toMins(sl.end);
    return slFrom >= fromM && slTo <= toM;
  }

  // Score how well a slot matches instructor's preferred slots
  function score(pref, cand) {
    const pd = new Set(pref.days), cd = new Set(cand.days);
    const dayMatch = [...pd].every(d => cd.has(d)) && [...cd].every(d => pd.has(d));
    const timeMatch = pref.start === cand.start;
    return dayMatch && timeMatch ? 3 : dayMatch ? 2 : timeMatch ? 1 : 0;
  }

  function ranked(iid, isLab) {
    const pool = isLab ? labSlots : lecSlots;
    // Filter by availability first
    const avail = pool.filter(sl => instAllowsSlot(iid, sl));
    if (!avail.length) return pool; // fallback: use all slots if none fit window
    const prefs = CA_INST_PREFS[iid];
    if (!prefs) return avail;
    const plist = isLab ? prefs.lab_slots : prefs.lec_slots;
    if (!plist || !plist.length) return avail;
    return [...avail].sort((a, b) => {
      const sa = Math.max(0, ...plist.map(p => score(p, a)));
      const sb = Math.max(0, ...plist.map(p => score(p, b)));
      return sb - sa;
    });
  }

  function allocate(iid, label, isLab, rooms) {
    const slots = ranked(iid, isLab);
    for (const sl of slots) {
      if (!instFree(iid, sl)) continue;
      for (const rm of rooms) {
        if (roomFree(rm, sl)) {
          bookR(rm, sl, label); bookI(iid, sl, label);
          return { slot: sl, room: rm };
        }
      }
    }
    return null;
  }

  let conflicts = 0;
  const entries = {};
  plan.forEach(row => {
    const iid = row.iids[0] || null;
    const secs = [];
    for (let i = 0; i < row.secs; i++) {
      const lbl = `${row.code}-S${i + 1}`;
      const stuPerSec = row.proj > 0
        ? Math.ceil(row.proj / row.secs)
        : Math.ceil((row.past || 10) / row.secs) || 10;
      const obj = {
        num: i + 1, iid, iname: row.inames[0] || 'TBA', students: stuPerSec,
        lecSlot: null, lecRoom: null, labSlot: null, labRoom: null,
      };
      if (row.lhrs > 0 || row.session === 'lecture') {
        const r = allocate(iid, lbl, false, allLec);
        if (r) { obj.lecSlot = r.slot; obj.lecRoom = r.room; } else conflicts++;
      }
      if (row.lahrs > 0 || row.session === 'lab') {
        const r = allocate(iid, lbl + '_lab', true, allLab);
        if (r) { obj.labSlot = r.slot; obj.labRoom = r.room; } else conflicts++;
      }
      secs.push(obj);
    }
    entries[row.code] = secs;
  });
  S.timetable = { entries, conflicts, ts: new Date().toISOString() };
  localStorage.setItem(LS_TT, JSON.stringify(S.timetable));
  return S.timetable;
}

// ═════════════════════════════════════════════════════════════════════════════
//  COURSE ALLOCATION MODULE — UI
// ═════════════════════════════════════════════════════════════════════════════
function initAlloc() {
  const sec = document.getElementById('section-allocation');
  if (!sec) return;
  if (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
    try { S.semKey = CCK.getActiveSemKey(); } catch (e) {}
  loadPortal(); loadForecast(); loadOverrides();
  S.timetable = JSON.parse(localStorage.getItem(LS_TT) || 'null');
  const t = document.getElementById('admin-page-title');
  const sub = document.getElementById('admin-page-subtitle');
  if (t) t.textContent = 'Course Allocation';
  if (sub) sub.textContent = 'Enrollment predictions · Instructor scheduling · Room assignment';
  sec.innerHTML = allocShell();
  renderAlloc();
}

function allocShell() { return `
<style>
#ca-root *{box-sizing:border-box;}
.ca-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:20px;}
.ca-kpi{background:white;border-radius:var(--radius-lg);padding:16px;box-shadow:var(--shadow-sm);}
.ca-kpi-icon{width:34px;height:34px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;margin-bottom:10px;}
.ca-kpi-icon svg{width:16px;height:16px;}
.ca-kpi-icon.red{background:var(--cck-red-bg);color:var(--cck-red);}
.ca-kpi-icon.green{background:var(--green-100);color:#15803D;}
.ca-kpi-icon.blue{background:var(--blue-100);color:var(--blue-500);}
.ca-kpi-icon.orange{background:var(--orange-100);color:var(--orange-500);}
.ca-kpi-icon.purple{background:var(--purple-100);color:var(--purple-500);}
.ca-kpi-val{font-size:24px;font-weight:800;color:var(--gray-900);line-height:1;}
.ca-kpi-lbl{font-size:12px;color:var(--gray-500);margin-top:3px;}
.ca-kpi-sub{font-size:11px;margin-top:2px;}
.ca-bar{background:white;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;margin-bottom:16px;}
.ca-bar-row{display:flex;align-items:center;gap:6px;padding:10px 14px;}
.ca-bar-row+.ca-bar-row{border-top:1px solid var(--gray-100);}
.ca-bar-sep{width:1px;height:20px;background:var(--gray-200);margin:0 2px;flex-shrink:0;}
.ca-fb{padding:5px 11px;border:1px solid var(--gray-200);border-radius:var(--radius-full);font-size:12px;font-weight:600;color:var(--gray-600);font-family:inherit;cursor:pointer;background:white;transition:var(--transition-fast);white-space:nowrap;}
.ca-fb:hover{border-color:var(--gray-400);}
.ca-fb.active{background:var(--cck-red);border-color:var(--cck-red);color:white;}
.ca-sw{position:relative;}
.ca-sw svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);width:12px;height:12px;color:var(--gray-500);pointer-events:none;}
.ca-sw input{padding:6px 10px 6px 28px;border:1px solid var(--gray-200);border-radius:var(--radius-full);font-size:12px;font-family:inherit;width:200px;outline:none;background:var(--gray-50);}
.ca-sw input:focus{border-color:var(--cck-red);background:white;}
.ca-seg{display:inline-flex;border:1px solid var(--gray-200);border-radius:var(--radius);overflow:hidden;}
.ca-vbtn{padding:6px 13px;border:none;border-right:1px solid var(--gray-200);background:white;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;color:var(--gray-600);transition:var(--transition-fast);white-space:nowrap;}
.ca-vbtn:last-child{border-right:none;}
.ca-vbtn.active{background:var(--gray-900);color:white;}
.ca-abtn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:var(--radius);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border:none;transition:var(--transition-fast);white-space:nowrap;}
.ca-abtn svg{width:12px;height:12px;}
.ca-abtn.sec{background:white;border:1px solid var(--gray-200);color:var(--gray-700);}
.ca-abtn.sec:hover{border-color:var(--gray-400);}
.ca-abtn.pr{background:var(--cck-red);color:white;}
.ca-abtn.pr:hover{background:var(--cck-red-dark);}
.ca-ml{margin-left:auto;}
.ca-notice{padding:9px 13px;border-radius:var(--radius);font-size:12px;margin-bottom:13px;display:flex;align-items:center;gap:8px;}
.ca-notice svg{width:13px;height:13px;flex-shrink:0;}
.ca-notice.warn{background:#FFFBEB;color:#713F12;border:1px solid #FDE68A;}
.ca-notice.info{background:#EFF6FF;color:#1E3A8A;border:1px solid #BFDBFE;}
.ca-card{background:white;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;}
.ca-card-head{display:flex;justify-content:space-between;align-items:center;padding:13px 18px;border-bottom:1px solid var(--gray-100);}
.ca-card-head h3{font-size:14px;font-weight:700;color:var(--gray-900);margin:0;}
.c-tag{display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}
.c-lec{background:var(--green-100);color:#166534;}
.c-lab{background:var(--cck-red-bg);color:var(--cck-red-dark);}
.c-both{background:var(--blue-100);color:#1E40AF;}
/* Detail panel */
.ca-ov{display:none;position:fixed;inset:0;z-index:699;background:rgba(17,24,39,.3);}
.ca-ov.open{display:block;}
.ca-pn{position:fixed;right:0;top:0;bottom:0;width:480px;background:white;border-left:1px solid var(--gray-200);box-shadow:var(--shadow-xl);z-index:700;overflow-y:auto;transform:translateX(100%);transition:transform .25s ease;}
.ca-pn.open{transform:translateX(0);}
/* Forecast modal */
.ca-fcm{display:none;position:fixed;inset:0;z-index:900;background:rgba(15,23,42,.55);align-items:flex-start;justify-content:center;padding-top:56px;}
.ca-fcm.open{display:flex;}
.ca-modal-box{background:white;border-radius:var(--radius-xl);width:620px;max-width:96vw;max-height:84vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,.18);}
.ca-modal-hd{padding:20px 24px 0;flex-shrink:0;}
.ca-modal-body{overflow-y:auto;flex:1;}
.ca-modal-ft{padding:14px 24px;border-top:1px solid var(--gray-100);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;}
/* Forecast tabs */
.fc-tabs{display:flex;gap:0;border-bottom:1px solid var(--gray-200);margin:16px 0 0;}
.fc-tab{padding:9px 16px;border:none;background:none;font-size:13px;font-weight:600;color:var(--gray-500);cursor:pointer;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px;transition:var(--transition-fast);}
.fc-tab.active{color:var(--cck-red);border-bottom-color:var(--cck-red);}
.fc-panel{display:none;padding:20px 24px;}
.fc-panel.active{display:block;}
/* Forecast fields */
.fc-prog-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.fc-prog-item{background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-lg);padding:14px;}
.fc-prog-label{font-size:12px;font-weight:600;color:var(--gray-700);margin-bottom:10px;display:flex;align-items:center;gap:7px;}
.fc-prog-dept{width:8px;height:8px;border-radius:2px;flex-shrink:0;}
.fc-prog-dept.cs{background:#4F46E5;}
.fc-prog-dept.biz{background:#B45309;}
.fc-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.fc-row label{font-size:12px;color:var(--gray-600);flex:1;}
.fc-row input[type=number]{width:80px;padding:6px 8px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:13px;font-weight:700;text-align:center;font-family:inherit;outline:none;}
.fc-row input:focus{border-color:var(--cck-red);}
.fc-pass-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius);background:white;border:1px solid var(--gray-200);margin-bottom:5px;}
.fc-pass-code{font-size:11px;font-weight:700;font-family:monospace;color:var(--gray-900);min-width:80px;}
.fc-pass-name{font-size:11px;color:var(--gray-600);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fc-pass-input{width:70px;padding:5px 6px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:12px;font-weight:700;text-align:center;font-family:inherit;outline:none;}
.fc-pass-input:focus{border-color:var(--cck-red);}
.fc-pass-pct{font-size:10px;color:var(--gray-500);min-width:28px;text-align:right;}
.fc-search{padding:8px 12px 0;}
.fc-search input{width:100%;padding:7px 11px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:12px;font-family:inherit;outline:none;}
.fc-search input:focus{border-color:var(--cck-red);}
.fc-pass-list{max-height:340px;overflow-y:auto;padding:10px 12px;}
/* Predict breakdown */
.pred-bar{height:5px;background:var(--gray-200);border-radius:3px;margin:6px 0 2px;overflow:hidden;}
.pred-bar-fill{height:100%;border-radius:3px;transition:width .3s;}
</style>
<div id="ca-root">
  <!-- KPIs -->
  <div class="ca-kpis">
    <div class="ca-kpi" id="cak-total">
      <div class="ca-kpi-icon red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
      <div class="ca-kpi-val">—</div><div class="ca-kpi-lbl">Courses</div><div class="ca-kpi-sub"></div>
    </div>
    <div class="ca-kpi" id="cak-assigned">
      <div class="ca-kpi-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div class="ca-kpi-val">—</div><div class="ca-kpi-lbl">Assigned</div><div class="ca-kpi-sub"></div>
    </div>
    <div class="ca-kpi" id="cak-sections">
      <div class="ca-kpi-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div>
      <div class="ca-kpi-val">—</div><div class="ca-kpi-lbl">Sections</div><div class="ca-kpi-sub"></div>
    </div>
    <div class="ca-kpi" id="cak-students">
      <div class="ca-kpi-icon orange"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div class="ca-kpi-val">—</div><div class="ca-kpi-lbl">Projected Students</div><div class="ca-kpi-sub"></div>
    </div>
    <div class="ca-kpi" id="cak-synced">
      <div class="ca-kpi-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg></div>
      <div class="ca-kpi-val">—</div><div class="ca-kpi-lbl">Portals Synced</div><div class="ca-kpi-sub"></div>
    </div>
  </div>

  <div id="ca-ns" class="ca-notice warn" style="display:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    No portal data loaded. Go to <strong>&nbsp;Portal Review&nbsp;</strong> to approve portals first.
  </div>
  <div id="ca-ne" class="ca-notice info" style="display:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
    <span id="ca-ne-txt"></span>
  </div>

  <!-- Controls -->
  <div class="ca-bar">
    <div class="ca-bar-row">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-500);white-space:nowrap">Filter</span>
      <div class="ca-bar-sep"></div>
      <button class="ca-fb active" onclick="caF('all',this)">All</button>
      <button class="ca-fb" onclick="caF('assigned',this)">Assigned</button>
      <button class="ca-fb" onclick="caF('unassigned',this)">Unassigned</button>
      <button class="ca-fb" onclick="caF('lab',this)">Has Lab</button>
      <button class="ca-fb" onclick="caF('lecture',this)">Lecture Only</button>
      <div class="ca-bar-sep"></div>
      <div class="ca-sw">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="Search code or instructor…" oninput="caSearch(this.value)">
      </div>
      <div class="ca-ml" style="font-size:12px;color:var(--gray-500)" id="ca-cnt"></div>
    </div>
    <div class="ca-bar-row">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-500);white-space:nowrap">View</span>
      <div class="ca-bar-sep"></div>
      <div class="ca-seg">
        <button class="ca-vbtn active" data-v="plan" onclick="caView('plan',this)">Course Plan</button>
        <button class="ca-vbtn" data-v="tt" onclick="caView('tt',this)">Timetable</button>
      </div>
      <div class="ca-ml" style="display:flex;gap:8px">
        <button class="ca-abtn sec" onclick="caOpenForecast()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          Enrollment Forecast
        </button>
        <button class="ca-abtn pr" onclick="caGenTT()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Generate Timetable
        </button>
      </div>
    </div>
  </div>

  <!-- Plan card -->
  <div class="ca-card" id="ca-plan-card">
    <div class="ca-card-head"><h3>Course Allocation Plan</h3></div>
    <div style="overflow-x:auto">
      <table class="admin-table" style="min-width:900px">
        <thead><tr>
          <th>Code</th><th>Course Name</th><th style="text-align:center">Credits</th>
          <th style="text-align:center">Session</th><th style="text-align:center">Projected</th>
          <th style="text-align:center">Sections</th><th>Instructor</th><th style="text-align:center">Room</th>
        </tr></thead>
        <tbody id="ca-tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- Timetable card -->
  <div class="ca-card" id="ca-tt-card" style="display:none">
    <div id="ca-tt-inner"></div>
  </div>

  <!-- Overlays -->
  <div class="ca-ov" id="ca-ov" onclick="caPnClose()"></div>
  <div class="ca-pn" id="ca-pn"></div>
</div>

<!-- Forecast Modal -->
<div class="ca-fcm" id="ca-fcm">
  <div class="ca-modal-box">
    <div class="ca-modal-hd">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h3 style="font-size:17px;font-weight:800;color:var(--gray-900);margin:0 0 3px">Enrollment Forecast</h3>
          <p style="font-size:12px;color:var(--gray-500);margin:0">Configure expected new students and pass rates to predict class sizes</p>
        </div>
        <button onclick="caCloseForecast()" style="width:30px;height:30px;border:1px solid var(--gray-200);background:white;border-radius:var(--radius);cursor:pointer;color:var(--gray-500);font-size:16px;flex-shrink:0;margin-left:12px">&#x2715;</button>
      </div>
      <!-- Tabs -->
      <div class="fc-tabs">
        <button class="fc-tab active" onclick="fcTab('new',this)">New Students</button>
        <button class="fc-tab" onclick="fcTab('passrate',this)">Pass Rates</button>
        <button class="fc-tab" onclick="fcTab('preview',this)">Preview</button>
      </div>
    </div>

    <div class="ca-modal-body">
      <!-- Tab: New Students -->
      <div class="fc-panel active" id="fc-panel-new">
        <p style="font-size:12px;color:var(--gray-600);margin:0 0 14px;line-height:1.5">Enter expected new student intake per program. These are added on top of returning students (those who passed) and re-takers (those who failed). Baseline: 535 total existing students.</p>
        <div class="fc-prog-grid" id="fc-prog-grid"></div>
        <div style="margin-top:14px;padding:12px;background:var(--gray-50);border-radius:var(--radius);border:1px solid var(--gray-200)">
          <div style="font-size:11px;color:var(--gray-500);margin-bottom:3px">Total new students expected</div>
          <div id="fc-total-sum" style="font-size:28px;font-weight:800;color:var(--gray-900)">0</div>
        </div>
      </div>

      <!-- Tab: Pass Rates -->
      <div class="fc-panel" id="fc-panel-passrate">
        <p style="font-size:12px;color:var(--gray-600);margin:0 0 10px;line-height:1.5">Adjust historical pass rates per course. Students who fail are counted as re-enrollment demand for the next semester.</p>
        <div class="fc-search"><input type="text" placeholder="Search course…" oninput="fcPassSearch(this.value)" id="fc-pass-search"></div>
        <div class="fc-pass-list" id="fc-pass-list"></div>
      </div>

      <!-- Tab: Preview -->
      <div class="fc-panel" id="fc-panel-preview">
        <p style="font-size:12px;color:var(--gray-600);margin:0 0 14px;line-height:1.5">Enrollment projection breakdown for top courses. Shows: past enrollment + re-takers (failed) + new student share.</p>
        <div id="fc-preview-list"></div>
      </div>
    </div>

    <div class="ca-modal-ft">
      <div style="font-size:12px;color:var(--gray-500)">Changes applied immediately to the plan</div>
      <div style="display:flex;gap:8px">
        <button onclick="caCloseForecast()" class="ca-abtn sec">Close</button>
        <button onclick="caSaveForecast()" class="ca-abtn pr">Apply Forecast</button>
      </div>
    </div>
  </div>
</div>
`; }

// ─────────────────────────────────────────────────────────────────────────────
//  RENDER ALLOCATION
// ─────────────────────────────────────────────────────────────────────────────
function renderAlloc() {
  S.plan = S.plan || buildPlan();
  caRenderKPIs();
  caRenderNotices();
  const v = document.querySelector('.ca-vbtn.active')?.dataset.v || 'plan';
  if (v === 'plan') caRenderRows(); else caRenderMiniTT();
}

function caRenderKPIs() {
  const p = S.plan;
  const total = p.length, asgn = p.filter(r => r.assigned).length;
  const secs = p.reduce((s, r) => s + r.secs, 0);
  const stu = p.reduce((s, r) => s + r.proj, 0);
  const hodKeys = Object.keys(S.assignments).length;
  const instKeys = Object.keys(S.instData).length;
  const credKeys = Object.keys(S.credits).length;
  const roomLen = S.rooms.length;
  const syn = [
    hodKeys ? `HOD (${hodKeys} instructors)` : null,
    roomLen ? `Facility (${roomLen} rooms)` : null,
    credKeys ? `Reg 1 (${credKeys} credits)` : null,
    instKeys ? `Reg 2 (${instKeys} staff)` : null,
  ].filter(Boolean);

  const kv = (id, val, sub, col) => {
    const el = document.getElementById(id); if (!el) return;
    el.querySelector('.ca-kpi-val').textContent = val;
    const s = el.querySelector('.ca-kpi-sub');
    s.textContent = sub || '';
    if (col) s.style.color = col;
  };
  const ua = total - asgn;
  kv('cak-total', total, p.filter(r => r.session !== 'lecture').length + ' with lab');
  kv('cak-assigned', asgn + '/' + total, ua > 0 ? ua + ' unassigned' : 'All covered', ua > 0 ? 'var(--orange-500)' : 'var(--green-500)');
  kv('cak-sections', secs, 'across ' + total + ' courses');
  const fc = S.forecast[S.semKey] || {};
  kv('cak-students', stu > 0 ? stu : '—', fc._total > 0 ? `incl. ${fc._total} new + re-takers` : 'from historical + pass/fail');
  kv('cak-synced', syn.length ? syn.length + '/4' : 'None', syn.join(' · ') || 'No portals connected', syn.length < 4 ? 'var(--orange-500)' : 'var(--green-500)');
}

function caRenderNotices() {
  const ns = document.getElementById('ca-ns');
  if (ns) ns.style.display = Object.keys(S.assignments).length ? 'none' : '';
  const fc = (S.forecast[S.semKey] || {})._total || 0;
  const ne = document.getElementById('ca-ne'), nt = document.getElementById('ca-ne-txt');
  if (ne && nt) {
    ne.style.display = fc > 0 ? '' : 'none';
    nt.textContent = `Forecast active: ${fc} new students — projections include re-takers from failed courses.`;
  }
}

function caRenderRows() {
  const tbody = document.getElementById('ca-tbody'); if (!tbody) return;
  let rows = [...S.plan];
  if (S.filter === 'assigned') rows = rows.filter(r => r.assigned);
  if (S.filter === 'unassigned') rows = rows.filter(r => !r.assigned);
  if (S.filter === 'lab') rows = rows.filter(r => r.session !== 'lecture');
  if (S.filter === 'lecture') rows = rows.filter(r => r.session === 'lecture');
  if (S.search) {
    const q = S.search.toLowerCase();
    rows = rows.filter(r =>
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.inames.some(n => n.toLowerCase().includes(q)));
  }
  const cnt = document.getElementById('ca-cnt');
  if (cnt) cnt.textContent = rows.length + ' courses';
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--gray-500)">No courses match the current filter.</td></tr>`;
    return;
  }
  const maxP = Math.max(...rows.map(r => r.proj), 1);
  const tt = S.timetable;

  tbody.innerHTML = rows.map(row => {
    const stag = row.session === 'lecture'
      ? '<span class="c-tag c-lec">Lecture</span>'
      : row.session === 'lab'
        ? '<span class="c-tag c-lab">Lab</span>'
        : '<span class="c-tag c-both">Lec+Lab</span>';

    // Instructor cell
    const ihtml = (() => {
      if (!row.inames.length)
        return `<span style="font-size:11px;font-weight:600;color:#B45309;background:#FFFBEB;padding:2px 7px;border-radius:3px">Unassigned</span>`;
      const d0 = row.iids[0] ? S.instData[row.iids[0]] || {} : {};
      const isPT = d0.employment === 'Part-Time';
      const avail = (d0.timeFrom && d0.timeTo) ? `<span style="font-size:9px;color:var(--gray-500);font-family:monospace">${d0.timeFrom}–${d0.timeTo}</span>` : '';
      const empBadge = row.iids[0]
        ? `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:2px;background:${isPT ? '#FEF9C3' : '#DBEAFE'};color:${isPT ? '#92400E' : '#1E40AF'}">${isPT ? 'PT' : 'FT'}</span>` : '';
      return `<div style="font-size:12px;font-weight:600;color:var(--gray-800)">${row.inames[0]}</div>`
        + `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px">${empBadge}${avail}</div>`
        + (row.inames.length > 1 ? `<div style="font-size:10px;color:var(--gray-500)">+${row.inames.length - 1} more</div>` : '');
    })();

    // Student projection cell with breakdown
    const pct = Math.round(row.proj / maxP * 100);
    const shtml = `<div style="font-size:14px;font-weight:800;color:var(--gray-900)">${row.proj}</div>
      <div class="pred-bar"><div class="pred-bar-fill" style="width:${pct}%;background:var(--cck-red)"></div></div>
      <div style="font-size:9px;color:var(--gray-500);white-space:nowrap">${row.past} hist · ${row.failBack} re-take · ${row.newShare} new</div>`;

    // Sections + slot hint
    const ttSecs = tt && tt.entries[row.code];
    const secHtml = `<div style="font-size:14px;font-weight:700">${row.secs}</div>`
      + (ttSecs ? ttSecs.slice(0, 2).map((s, i) => {
        const sl = s.lecSlot;
        return sl ? `<div style="font-size:9px;color:var(--gray-500)">S${i + 1}: ${sl.days.join(',')} ${sl.start}</div>` : '';
      }).join('') : '');

    // Room cell
    const ttEntry = tt && tt.entries[row.code] && tt.entries[row.code][0];
    const assignedRoom = ttEntry ? (ttEntry.lecRoom || ttEntry.labRoom || null) : null;
    const facRoom = assignedRoom ? S.rooms.find(r => String(r.id || r.room_id || r.name || '').trim() === assignedRoom) : null;
    const roomHtml = assignedRoom
      ? (facRoom
        ? `<div style="font-size:12px;font-weight:600">${facRoom.name || assignedRoom}</div><div style="font-size:9px;color:var(--gray-500)">${facRoom.type || ''}${facRoom.capacity ? ' · cap ' + facRoom.capacity : ''}</div>`
        : `<span style="font-size:12px;font-weight:600">${assignedRoom}</span>`)
      : (row.session === 'lecture'
        ? `<span style="font-size:10px;color:var(--gray-500)">Classroom</span>`
        : row.session === 'lab'
          ? `<span style="font-size:10px;font-weight:600;color:var(--cck-red)">Lab</span>`
          : `<span style="font-size:10px;font-weight:600;color:var(--blue-500)">Lec+Lab</span>`);

    return `<tr onclick="caOpenDetail('${row.code}')" style="cursor:pointer">
      <td><span style="font-family:monospace;font-size:12px;font-weight:700">${row.code}</span></td>
      <td><div style="font-size:12px;font-weight:500;max-width:220px;line-height:1.35">${row.name}</div></td>
      <td style="text-align:center"><span style="font-size:14px;font-weight:800;color:var(--cck-red)">${row.credits}</span></td>
      <td style="text-align:center">${stag}</td>
      <td style="text-align:center">${shtml}</td>
      <td style="text-align:center">${secHtml}</td>
      <td>${ihtml}</td>
      <td style="text-align:center">${roomHtml}</td>
    </tr>`;
  }).join('');
}

function caRenderMiniTT() {
  const inner = document.getElementById('ca-tt-inner'); if (!inner) return;
  if (!S.timetable) {
    inner.innerHTML = `<div style="padding:56px;text-align:center;color:var(--gray-500)">
      <p style="margin-bottom:12px">No timetable generated yet.</p>
      <button onclick="caGenTT()" style="padding:8px 16px;background:var(--cck-red);color:white;border:none;border-radius:var(--radius);cursor:pointer;font-family:inherit;font-weight:600">Generate Timetable</button>
    </div>`;
    return;
  }
  renderTTGrid(inner, S.timetable);
}

// ─────────────────────────────────────────────────────────────────────────────
//  DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────
function caOpenDetail(code) {
  S.activeAlloc = code;
  const row = S.plan.find(r => r.code === code); if (!row) return;
  const tt = S.timetable && S.timetable.entries[code] ? S.timetable.entries[code] : null;

  const allInstBase = Object.keys(CA_INST_PREFS).map(id => {
    const d = S.instData[id];
    return { id, name: (d && d.name) || id };
  });

  const syncLab = S.rooms.filter(r => (r.type || r.room_type) === 'lab').map(r => String(r.id || r.name).trim());
  const syncLec = S.rooms.filter(r => (r.type || r.room_type) !== 'lab').map(r => String(r.id || r.name).trim());
  const lecRooms = syncLec.length ? syncLec : ['B2-023', 'B2-024', 'B2-025', 'B2-026', 'B2-027'];
  const labRooms = syncLab.length ? syncLab : ['Lab-A', 'Lab-B', 'Lab-C'];

  const stag = row.session === 'lecture' ? '<span class="c-tag c-lec">Lecture</span>'
    : row.session === 'lab' ? '<span class="c-tag c-lab">Lab</span>'
      : '<span class="c-tag c-both">Lec+Lab</span>';

  const secCards = Array.from({ length: row.secs }, (_, i) => {
    const s = tt && tt[i];
    const ls = s && s.lecSlot, lr = s && s.lecRoom;
    const abs = s && s.labSlot, ar = s && s.labRoom;
    const iid = (s && s.iid) || row.iids[0] || '';
    const stu = s ? s.students : Math.max(1, Math.ceil((row.proj || row.past || 10) / row.secs));
    return `<div style="border:1px solid var(--gray-200);border-radius:var(--radius);padding:14px;margin-bottom:10px;background:var(--gray-50)">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:13px;font-weight:700">Section ${i + 1}</span>
        <span style="font-size:12px;color:var(--gray-500)">${stu} students</span>
      </div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--gray-500);margin-bottom:5px">Instructor</div>
      <select onchange="caSecInst('${code}',${i},this.value)" style="width:100%;padding:7px 10px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:12px;font-family:inherit;outline:none;margin-bottom:10px;background:white">
        <option value="">— TBA —</option>
        ${allInstBase.map(ins => `<option value="${ins.id}" ${ins.id === iid ? 'selected' : ''}>${ins.name}</option>`).join('')}
      </select>
      ${(row.lhrs > 0 || row.session === 'lecture') ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--gray-500);margin-bottom:4px">Lecture Slot</div>
          <div style="font-size:12px;padding:6px 8px;background:var(--green-100);border-radius:4px">${ls ? ls.days.join(',') + '  ' + ls.start + '–' + ls.end : 'Not scheduled'}</div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--gray-500);margin-bottom:4px">Classroom</div>
          <select onchange="caSecRoom('${code}',${i},'lec',this.value)" style="width:100%;padding:6px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:12px;font-family:inherit;outline:none;background:white">
            <option value="">— Auto —</option>
            ${lecRooms.map(r => {
              const rm = S.rooms.find(x => String(x.id || x.room_id || x.name || '').trim() === r);
              const lbl = rm ? (rm.name || r) + (rm.capacity ? ' (cap ' + rm.capacity + ')' : '') : r;
              return `<option value="${r}" ${r === lr ? 'selected' : ''}>${lbl}</option>`;
            }).join('')}
          </select>
        </div>
      </div>` : ''}
      ${(row.lahrs > 0 || row.session === 'lab') ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--gray-500);margin-bottom:4px">Lab Slot</div>
          <div style="font-size:12px;padding:6px 8px;background:var(--cck-red-bg);border-radius:4px">${abs ? abs.days.join(',') + '  ' + abs.start + '–' + abs.end : 'Not scheduled'}</div>
        </div>
        <div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--gray-500);margin-bottom:4px">Lab Room</div>
          <select onchange="caSecRoom('${code}',${i},'lab',this.value)" style="width:100%;padding:6px;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:12px;font-family:inherit;outline:none;background:white">
            <option value="">— Auto —</option>
            ${labRooms.map(r => {
              const rm = S.rooms.find(x => String(x.id || x.room_id || x.name || '').trim() === r);
              const lbl = rm ? (rm.name || r) + (rm.capacity ? ' (cap ' + rm.capacity + ')' : '') : r;
              return `<option value="${r}" ${r === ar ? 'selected' : ''}>${lbl}</option>`;
            }).join('')}
          </select>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  // Build instructor cards with full Reg2 data
  const instSection = (() => {
    if (!row.iids.length)
      return `<div style="padding:10px 12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:var(--radius);font-size:12px;color:#92400E;font-weight:600;margin-bottom:14px">Not yet assigned by HOD</div>`;
    return `<div style="margin-bottom:14px">` + row.iids.map(iid => {
      const d = S.instData[iid] || {};
      const name = d.name || iid;
      const isPT = d.employment === 'Part-Time';
      const ini = name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?';
      const avail = (d.timeFrom && d.timeTo) ? `${d.timeFrom}–${d.timeTo}` : null;
      return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);margin-bottom:6px">
        <div style="width:36px;height:36px;border-radius:50%;background:${isPT ? '#FEF9C3' : '#DBEAFE'};border:2px solid ${isPT ? '#FDE68A' : '#BFDBFE'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:${isPT ? '#92400E' : '#1D4ED8'};flex-shrink:0">${ini}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--gray-900)">${name}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
            <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:2px;background:${isPT ? '#FEF9C3' : '#DBEAFE'};color:${isPT ? '#92400E' : '#1D4ED8'}">${isPT ? 'Part-Time' : 'Full-Time'}</span>
            ${d.qualification ? `<span style="font-size:10px;padding:2px 6px;border-radius:2px;background:var(--gray-100);color:var(--gray-600)">${d.qualification}</span>` : ''}
            ${avail ? `<span style="font-size:10px;padding:2px 6px;border-radius:2px;background:var(--gray-100);color:var(--gray-600)">Available ${avail}</span>` : ''}
            ${d.maxCredits ? `<span style="font-size:10px;padding:2px 6px;border-radius:2px;background:var(--gray-100);color:var(--gray-600)">Max ${d.maxCredits} cr</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('') + `</div>`;
  })();

  const hist = CA_HISTORICAL[row.code] || { pass_rate: 0.75 };
  const pct = Math.round(hist.pass_rate * 100);

  const pn = document.getElementById('ca-pn');
  pn.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--gray-100);display:flex;justify-content:space-between;align-items:flex-start;position:sticky;top:0;background:white;z-index:1">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-size:18px;font-weight:800;font-family:monospace">${row.code}</span>${stag}
        </div>
        <div style="font-size:12px;color:var(--gray-600);max-width:330px;line-height:1.4">${row.name}</div>
      </div>
      <button onclick="caPnClose()" style="width:28px;height:28px;border:1px solid var(--gray-200);background:white;border-radius:var(--radius);cursor:pointer;color:var(--gray-500)">&#x2715;</button>
    </div>
    <div style="padding:16px 20px">
      ${instSection}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:12px;text-align:center">
          <div style="font-size:10px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.3px">Credits</div>
          <div style="font-size:22px;font-weight:800;color:var(--cck-red)">${row.credits}</div>
        </div>
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:12px;text-align:center">
          <div style="font-size:10px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.3px">Projected</div>
          <div style="font-size:22px;font-weight:800;color:var(--gray-900)">${row.proj}</div>
          <div style="font-size:9px;color:var(--gray-500)">${row.past} + ${row.failBack} + ${row.newShare}</div>
        </div>
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:12px;text-align:center">
          <div style="font-size:10px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.3px">Sections</div>
          <div style="font-size:22px;font-weight:800;color:var(--gray-900)">${row.secs}</div>
        </div>
      </div>

      <!-- Enrollment breakdown -->
      <div style="background:#F8FAFC;border:1px solid var(--gray-200);border-radius:var(--radius);padding:12px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--gray-500);margin-bottom:8px">Enrollment Breakdown</div>
        <div style="display:flex;gap:14px;font-size:12px">
          <div><div style="color:var(--gray-500);font-size:10px">Historical</div><strong style="color:var(--gray-900)">${row.past}</strong></div>
          <div><div style="color:var(--gray-500);font-size:10px">Re-takers (failed)</div><strong style="color:#DC2626">${row.failBack}</strong></div>
          <div><div style="color:var(--gray-500);font-size:10px">New students</div><strong style="color:#15803D">${row.newShare}</strong></div>
          <div style="margin-left:auto;text-align:right"><div style="color:var(--gray-500);font-size:10px">Pass Rate</div><strong style="color:var(--gray-900)">${pct}%</strong></div>
        </div>
      </div>

      ${row.lhrs > 0 ? `<div style="padding:8px 12px;background:var(--green-100);border-radius:var(--radius);font-size:12px;color:#166534;margin-bottom:7px">Lecture: ${row.lhrs} hr/week — classroom needed</div>` : ''}
      ${row.lahrs > 0 ? `<div style="padding:8px 12px;background:var(--cck-red-bg);border-radius:var(--radius);font-size:12px;color:var(--cck-red-dark);margin-bottom:7px">Lab: ${row.lahrs} hr/week — lab room needed</div>` : ''}

      <div style="font-size:12px;font-weight:700;color:var(--gray-900);margin:14px 0 8px">Sections</div>
      ${secCards}
      <button onclick="caGenTT()" style="width:100%;margin-top:8px;padding:9px;background:var(--cck-red);color:white;border:none;border-radius:var(--radius);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Re-run Timetable Generator</button>
    </div>`;
  pn.classList.add('open');
  document.getElementById('ca-ov').classList.add('open');
}

function caPnClose() {
  document.getElementById('ca-pn').classList.remove('open');
  document.getElementById('ca-ov').classList.remove('open');
}
function caSecInst(code, si, iid) {
  if (!S.timetable || !S.timetable.entries[code] || !S.timetable.entries[code][si]) return;
  const d = S.instData[iid];
  S.timetable.entries[code][si].iid = iid;
  S.timetable.entries[code][si].iname = (d && d.name) || iid;
  localStorage.setItem(LS_TT, JSON.stringify(S.timetable));
}
function caSecRoom(code, si, type, room) {
  if (!S.timetable || !S.timetable.entries[code] || !S.timetable.entries[code][si]) return;
  if (type === 'lec') S.timetable.entries[code][si].lecRoom = room;
  else S.timetable.entries[code][si].labRoom = room;
  localStorage.setItem(LS_TT, JSON.stringify(S.timetable));
}

// ─────────────────────────────────────────────────────────────────────────────
//  FORECAST MODAL — tabbed
// ─────────────────────────────────────────────────────────────────────────────
let _fcPassFilter = '';

function caOpenForecast() {
  const fc = S.forecast[S.semKey] || {};
  // Build new-students tab
  document.getElementById('fc-prog-grid').innerHTML = PROGRAMS.map(p => {
    const val = fc[p.key] || 0;
    return `<div class="fc-prog-item">
      <div class="fc-prog-label">
        <span class="fc-prog-dept ${p.dept}"></span>
        ${p.label}
      </div>
      <div class="fc-row">
        <label>Expected new intake</label>
        <input type="number" min="0" max="999" id="fc-prog-${p.key}" value="${val}" oninput="fcUpdateTotal()">
      </div>
    </div>`;
  }).join('');
  fcUpdateTotal();
  fcRenderPassList('');
  document.getElementById('ca-fcm').classList.add('open');
}

function caCloseForecast() {
  document.getElementById('ca-fcm').classList.remove('open');
}

function fcTab(name, btn) {
  document.querySelectorAll('#ca-fcm .fc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#ca-fcm .fc-panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('fc-panel-' + name).classList.add('active');
  if (name === 'preview') fcRenderPreview();
}

function fcUpdateTotal() {
  const t = PROGRAMS.reduce((s, p) => s + (parseInt(document.getElementById('fc-prog-' + p.key)?.value) || 0), 0);
  document.getElementById('fc-total-sum').textContent = t;
}

function fcPassSearch(v) {
  _fcPassFilter = v;
  fcRenderPassList(v);
}

function fcRenderPassList(filter) {
  const el = document.getElementById('fc-pass-list'); if (!el) return;
  const stored = S.forecast._pass_rates || {};
  const codes = Object.keys(CA_HISTORICAL)
    .filter(c => !filter || c.toLowerCase().includes(filter.toLowerCase()) ||
      (CA_COURSES_BASE[c] && CA_COURSES_BASE[c].name.toLowerCase().includes(filter.toLowerCase())))
    .slice(0, 120);
  el.innerHTML = codes.map(code => {
    const hist = CA_HISTORICAL[code];
    const base = hist.pass_rate || 0.75;
    const cur = stored[code] !== undefined ? stored[code] : base;
    const pct = Math.round(cur * 100);
    const name = CA_COURSES_BASE[code] ? CA_COURSES_BASE[code].name : code;
    return `<div class="fc-pass-row">
      <div class="fc-pass-code">${code}</div>
      <div class="fc-pass-name" title="${name}">${name}</div>
      <input type="number" class="fc-pass-input" min="0" max="100" id="fcp-${code.replace(/\s/g,'_')}" value="${pct}" oninput="fcSyncPassRate('${code}',this.value)">
      <div class="fc-pass-pct">%</div>
    </div>`;
  }).join('');
}

function fcSyncPassRate(code, val) {
  if (!S.forecast._pass_rates) S.forecast._pass_rates = {};
  const v = Math.max(0, Math.min(100, parseInt(val) || 0)) / 100;
  S.forecast._pass_rates[code] = v;
  // Update CA_HISTORICAL live
  if (CA_HISTORICAL[code]) CA_HISTORICAL[code].pass_rate = v;
}

function fcRenderPreview() {
  const el = document.getElementById('fc-preview-list'); if (!el) return;
  const newTotal = PROGRAMS.reduce((s, p) => s + (parseInt(document.getElementById('fc-prog-' + p.key)?.value) || 0), 0);
  const top20 = [...S.plan].sort((a, b) => b.proj - a.proj).slice(0, 20);
  el.innerHTML = top20.map(row => {
    const { projected, base, failBack, newShare, passRate } = predictEnrollment(row.code, CA_HISTORICAL[row.code] || { past_students: row.past, pass_rate: 0.75 }, newTotal);
    const cap = row.session !== 'lecture' ? CAP.lab : CAP.lecture;
    const secs = projected > 0 ? Math.max(1, Math.ceil(projected / cap)) : 1;
    const pct = Math.round(passRate * 100);
    return `<div style="padding:10px 0;border-bottom:1px solid var(--gray-100);display:flex;gap:10px;align-items:flex-start">
      <div style="min-width:80px;font-size:11px;font-weight:700;font-family:monospace;color:var(--gray-900)">${row.code}</div>
      <div style="flex:1">
        <div style="font-size:11px;color:var(--gray-700);margin-bottom:5px">${row.name}</div>
        <div style="display:flex;gap:8px;font-size:10px;flex-wrap:wrap">
          <span style="color:var(--gray-500)">Historical: <strong>${base}</strong></span>
          <span style="color:#DC2626">Re-takers: <strong>+${failBack}</strong></span>
          <span style="color:#15803D">New: <strong>+${newShare}</strong></span>
          <span style="color:var(--gray-900);font-weight:700">Total: ${projected}</span>
          <span style="color:var(--gray-500)">Pass: ${pct}%</span>
          <span style="color:var(--blue-500)">${secs} section${secs > 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function caSaveForecast() {
  const sk = S.semKey;
  if (!S.forecast[sk]) S.forecast[sk] = {};
  let t = 0;
  PROGRAMS.forEach(p => {
    const v = parseInt(document.getElementById('fc-prog-' + p.key)?.value) || 0;
    S.forecast[sk][p.key] = v;
    t += v;
  });
  S.forecast[sk]._total = t;
  // Sync any pass rate overrides
  if (S.forecast._pass_rates) {
    Object.entries(S.forecast._pass_rates).forEach(([code, v]) => {
      if (CA_HISTORICAL[code]) CA_HISTORICAL[code].pass_rate = v;
    });
  }
  localStorage.setItem(LS_FORECAST, JSON.stringify(S.forecast));
  caCloseForecast();
  S.plan = null; S.timetable = null;
  renderAlloc();
  cckToast(t > 0 ? `Forecast applied: ${t} new students + pass/fail re-enrollment` : 'Forecast cleared — using historical data');
}

function caGenTT() {
  S.plan = S.plan || buildPlan();
  cckToast('Generating conflict-free timetable from portal data…');
  setTimeout(() => {
    const tt = runScheduler();
    S.plan = null;
    renderAlloc();
    caPnClose();
    cckToast('Timetable ready · ' + tt.conflicts + ' conflict' + (tt.conflicts !== 1 ? 's' : ''), tt.conflicts > 0 ? 'warn' : 'ok');
  }, 80);
}

function caF(f, btn) {
  S.filter = f;
  document.querySelectorAll('#ca-root .ca-fb').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  caRenderRows();
}
function caSearch(v) { S.search = v; caRenderRows(); }
function caView(v, btn) {
  document.querySelectorAll('.ca-vbtn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const pc = document.getElementById('ca-plan-card'), tc = document.getElementById('ca-tt-card');
  if (pc) pc.style.display = v === 'plan' ? '' : 'none';
  if (tc) tc.style.display = v === 'tt' ? '' : 'none';
  if (v === 'tt') caRenderMiniTT();
}

// ═════════════════════════════════════════════════════════════════════════════
//  TIMETABLE GENERATION MODULE
// ═════════════════════════════════════════════════════════════════════════════
function initTT() {
  const sec = document.getElementById('section-timetable'); if (!sec) return;
  if (typeof CCK !== 'undefined' && CCK.getActiveSemKey)
    try { S.semKey = CCK.getActiveSemKey(); } catch (e) {}
  loadPortal(); loadForecast(); loadOverrides();
  S.timetable = JSON.parse(localStorage.getItem(LS_TT) || 'null');
  if (!S.plan) buildPlan();
  const t = document.getElementById('admin-page-title');
  const sub = document.getElementById('admin-page-subtitle');
  if (t) t.textContent = 'Timetable Generation';
  if (sub) sub.textContent = 'Conflict-free scheduling from portal data';
  sec.innerHTML = ttShell();
  renderTT();
}

function ttShell() { return `
<style>
#tt-root *{box-sizing:border-box;}
.tt-sources{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.tt-src{background:white;border-radius:var(--radius-lg);padding:14px;box-shadow:var(--shadow-sm);display:flex;align-items:center;gap:10px;}
.tt-src-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
.tt-src-dot.ok{background:var(--green-500);}
.tt-src-dot.warn{background:var(--orange-500);}
.tt-src-name{font-size:12px;font-weight:600;color:var(--gray-900);}
.tt-src-stat{font-size:11px;color:var(--gray-500);margin-top:1px;}
.tt-bar{background:white;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;margin-bottom:16px;}
.tt-bar-row{display:flex;align-items:center;gap:6px;padding:10px 14px;}
.tt-bar-row+.tt-bar-row{border-top:1px solid var(--gray-100);}
.tt-bsep{width:1px;height:20px;background:var(--gray-200);margin:0 2px;flex-shrink:0;}
.tt-ml{margin-left:auto;}
.tt-dbtn{padding:5px 11px;border:1px solid var(--gray-200);border-radius:var(--radius-full);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;background:white;color:var(--gray-600);transition:var(--transition-fast);white-space:nowrap;}
.tt-dbtn:hover{border-color:var(--gray-400);}
.tt-dbtn.active{background:var(--gray-900);border-color:var(--gray-900);color:white;}
.tt-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:var(--radius);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border:none;transition:var(--transition-fast);white-space:nowrap;}
.tt-btn svg{width:12px;height:12px;}
.tt-btn.pr{background:var(--cck-red);color:white;}
.tt-btn.pr:hover{background:var(--cck-red-dark);}
.tt-btn.sec{background:white;border:1px solid var(--gray-200);color:var(--gray-700);}
.tt-btn.sec:hover{border-color:var(--cck-red);color:var(--cck-red);}
.tt-vtgl{display:inline-flex;border:1px solid var(--gray-200);border-radius:var(--radius);overflow:hidden;}
.tt-vtgl-btn{padding:6px 13px;border:none;border-right:1px solid var(--gray-200);background:white;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;color:var(--gray-600);transition:var(--transition-fast);white-space:nowrap;}
.tt-vtgl-btn:last-child{border-right:none;}
.tt-vtgl-btn.active{background:var(--gray-900);color:white;}
.tt-card{background:white;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);overflow:hidden;}
.tt-card-head{display:flex;justify-content:space-between;align-items:center;padding:13px 18px;border-bottom:1px solid var(--gray-100);}
.tt-sumrow{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;}
.tt-sum{background:white;border-radius:var(--radius-lg);padding:14px;box-shadow:var(--shadow-sm);text-align:center;}
.tt-sum-val{font-size:22px;font-weight:800;color:var(--gray-900);}
.tt-sum-lbl{font-size:12px;color:var(--gray-500);margin-top:2px;}
.tt-conflict{padding:10px 14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:var(--radius);font-size:12px;color:var(--cck-red);margin-bottom:14px;display:flex;align-items:center;gap:8px;}
.tt-cell{border-left:3px solid transparent;border-radius:4px;padding:5px 7px;margin-bottom:3px;cursor:pointer;transition:opacity .15s;}
.tt-cell:hover{opacity:.8;}
.tt-cell-code{font-size:10px;font-weight:800;font-family:monospace;}
.tt-cell-info{font-size:9px;color:var(--gray-600);margin-top:1px;line-height:1.3;}
.tt-inst-row{display:flex;align-items:stretch;border-bottom:1px solid var(--gray-100);min-height:52px;}
.tt-inst-row:last-child{border-bottom:none;}
.tt-inst-name{width:180px;padding:10px 14px;font-size:12px;font-weight:600;color:var(--gray-800);border-right:1px solid var(--gray-100);flex-shrink:0;display:flex;align-items:center;}
.tt-inst-slots{flex:1;display:flex;flex-wrap:wrap;gap:4px;padding:8px;}
</style>
<div id="tt-root">
  <div class="tt-sources" id="tt-sources"></div>
  <div class="tt-sumrow" id="tt-sumrow">
    <div class="tt-sum" id="tt-s-sessions"><div class="tt-sum-val">—</div><div class="tt-sum-lbl">Sessions Scheduled</div></div>
    <div class="tt-sum" id="tt-s-courses"><div class="tt-sum-val">—</div><div class="tt-sum-lbl">Courses</div></div>
    <div class="tt-sum" id="tt-s-rooms"><div class="tt-sum-val">—</div><div class="tt-sum-lbl">Rooms Used</div></div>
    <div class="tt-sum" id="tt-s-conflicts"><div class="tt-sum-val" id="tt-conflicts-val">—</div><div class="tt-sum-lbl">Conflicts</div></div>
  </div>
  <div id="tt-conflict-notice" class="tt-conflict" style="display:none">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span id="tt-conflict-txt"></span>
  </div>
  <div class="tt-bar">
    <div class="tt-bar-row">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-500);white-space:nowrap">Day</span>
      <div class="tt-bsep"></div>
      <button class="tt-dbtn active" data-day="all" onclick="ttDay('all',this)">All Days</button>
      <button class="tt-dbtn" data-day="Su" onclick="ttDay('Su',this)">Sunday</button>
      <button class="tt-dbtn" data-day="M" onclick="ttDay('M',this)">Monday</button>
      <button class="tt-dbtn" data-day="T" onclick="ttDay('T',this)">Tuesday</button>
      <button class="tt-dbtn" data-day="W" onclick="ttDay('W',this)">Wednesday</button>
      <button class="tt-dbtn" data-day="Th" onclick="ttDay('Th',this)">Thursday</button>
    </div>
    <div class="tt-bar-row">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--gray-500);white-space:nowrap">View</span>
      <div class="tt-bsep"></div>
      <div class="tt-vtgl">
        <button class="tt-vtgl-btn active" data-ttv="grid" onclick="ttView('grid',this)">Grid</button>
        <button class="tt-vtgl-btn" data-ttv="inst" onclick="ttView('inst',this)">By Instructor</button>
        <button class="tt-vtgl-btn" data-ttv="room" onclick="ttView('room',this)">By Room</button>
      </div>
      <div class="tt-ml" style="display:flex;gap:8px">
        <button class="tt-btn sec" onclick="ttExportCSV()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </button>
        <button class="tt-btn pr" onclick="ttGenerate()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Generate Timetable
        </button>
      </div>
    </div>
  </div>
  <div class="tt-card" id="tt-display">
    <div style="padding:56px;text-align:center;color:var(--gray-500)">
      <p style="margin-bottom:12px">Click <strong>Generate Timetable</strong> to schedule all courses from portal data.</p>
    </div>
  </div>
</div>
`; }

let ttState = { day: 'all', view: 'grid' };

function renderTT() {
  ttRenderSources();
  ttRenderSummary();
  if (S.timetable) ttRenderDisplay();
}

function ttRenderSources() {
  const el = document.getElementById('tt-sources'); if (!el) return;
  const sources = [
    { name: 'HOD Assignments', ok: Object.keys(S.assignments).length > 0, stat: Object.keys(S.assignments).length > 0 ? Object.keys(S.assignments).length + ' instructors mapped' : 'Not synced yet' },
    { name: 'Reg 1 – Credits', ok: Object.keys(S.credits).length > 0, stat: Object.keys(S.credits).length > 0 ? Object.keys(S.credits).length + ' credit overrides' : 'Using defaults' },
    { name: 'Reg 2 – Instructors', ok: Object.keys(S.instData).length > 0, stat: Object.keys(S.instData).length > 0 ? Object.keys(S.instData).length + ' instructor records' : 'Using base data' },
    { name: 'Facility – Rooms', ok: S.rooms.length > 0, stat: S.rooms.length > 0 ? S.rooms.length + ' rooms' : 'Using defaults' },
  ];
  el.innerHTML = sources.map(s => `<div class="tt-src">
    <div class="tt-src-dot ${s.ok ? 'ok' : 'warn'}"></div>
    <div><div class="tt-src-name">${s.name}</div><div class="tt-src-stat">${s.stat}</div></div>
  </div>`).join('');
}

function ttRenderSummary() {
  const tt = S.timetable;
  const sv = (id, val) => { const el = document.getElementById(id); if (el) el.querySelector('.tt-sum-val').textContent = val; };
  if (!tt) { ['tt-s-sessions', 'tt-s-courses', 'tt-s-rooms', 'tt-s-conflicts'].forEach(id => sv(id, '—')); return; }
  let sessions = 0; const rooms = new Set(), codes = new Set();
  Object.entries(tt.entries).forEach(([code, secs]) => {
    codes.add(code);
    secs.forEach(s => {
      if (s.lecSlot) { sessions++; if (s.lecRoom) rooms.add(s.lecRoom); }
      if (s.labSlot) { sessions++; if (s.labRoom) rooms.add(s.labRoom); }
    });
  });
  sv('tt-s-sessions', sessions); sv('tt-s-courses', codes.size); sv('tt-s-rooms', rooms.size);
  const cv = document.getElementById('tt-conflicts-val');
  if (cv) { cv.textContent = tt.conflicts; cv.style.color = tt.conflicts === 0 ? 'var(--green-500)' : 'var(--cck-red)'; }
  const cn = document.getElementById('tt-conflict-notice'), ct = document.getElementById('tt-conflict-txt');
  if (cn && ct) {
    cn.style.display = tt.conflicts > 0 ? 'flex' : 'none';
    ct.textContent = `${tt.conflicts} session${tt.conflicts !== 1 ? 's' : ''} could not be scheduled without conflicts. Consider adding more rooms or adjusting instructor loads.`;
  }
}

function ttRenderDisplay() {
  const wrap = document.getElementById('tt-display'); if (!wrap || !S.timetable) return;
  if (ttState.view === 'grid') ttRenderGridInner(wrap, S.timetable);
  else if (ttState.view === 'inst') ttRenderByInst(wrap);
  else ttRenderByRoom(wrap);
}

function renderTTGrid(wrap, tt) { ttRenderGridInner(wrap, tt || S.timetable); }

function ttRenderGridInner(wrap, tt) {
  if (!tt) { wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray-500)">No timetable generated.</div>'; return; }
  const filterDay = ttState && ttState.day !== 'all' ? ttState.day : null;
  const activeDays = filterDay ? [filterDay] : DAYS;
  const sessMap = {};
  activeDays.forEach(d => { sessMap[d] = {}; });
  const allTimes = new Set();
  Object.entries(tt.entries).forEach(([code, secs]) => {
    const pr = S.plan && S.plan.find(r => r.code === code);
    secs.forEach((s, si) => {
      const addSess = (slot, room, type) => {
        if (!slot) return;
        allTimes.add(slot.start);
        slot.days.filter(d => activeDays.includes(d)).forEach(d => {
          if (!sessMap[d]) return;
          if (!sessMap[d][slot.start]) sessMap[d][slot.start] = [];
          sessMap[d][slot.start].push({ code, name: pr ? pr.name : code, sec: `S${si + 1}`, type, room, iname: s.iname, slot });
        });
      };
      addSess(s.lecSlot, s.lecRoom, 'Lecture');
      addSess(s.labSlot, s.labRoom, 'Lab');
    });
  });
  const sortedTimes = [...allTimes].sort();
  if (!sortedTimes.length) { wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray-500)">No sessions scheduled yet.</div>'; return; }
  wrap.innerHTML = `<div style="overflow-x:auto"><table style="border-collapse:collapse;min-width:${activeDays.length * 160 + 100}px;width:100%">
    <thead><tr style="background:var(--gray-50)">
      <th style="padding:10px 14px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--gray-200);text-align:left;width:80px">Time</th>
      ${activeDays.map(d => `<th style="padding:10px 14px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--gray-200);border-left:1px solid var(--gray-200);text-align:left;min-width:160px">${DAYF[d]}</th>`).join('')}
    </tr></thead>
    <tbody>${sortedTimes.map(time => `<tr>
      <td style="padding:7px 14px;font-size:11px;font-weight:700;color:var(--gray-500);border-bottom:1px solid var(--gray-100);white-space:nowrap;vertical-align:top">${time}</td>
      ${activeDays.map(d => {
        const cells = (sessMap[d] && sessMap[d][time]) || [];
        if (!cells.length) return `<td style="border-bottom:1px solid var(--gray-100);border-left:1px solid var(--gray-100);padding:5px;vertical-align:top"></td>`;
        return `<td style="border-bottom:1px solid var(--gray-100);border-left:1px solid var(--gray-100);padding:5px;vertical-align:top">${cells.map(c => {
          const isLab = c.type === 'Lab';
          return `<div class="tt-cell" onclick="caOpenDetail('${c.code}')" style="background:${isLab ? 'var(--cck-red-bg)' : 'var(--blue-100)'};border-left-color:${isLab ? 'var(--cck-red)' : 'var(--blue-500)'}">
            <div class="tt-cell-code">${c.code} ${c.sec}</div>
            <div class="tt-cell-info">${c.type} · ${c.slot.end}<br>${c.room || '—'}<br>${(c.iname || 'TBA').split(' ').slice(-1)[0]}</div>
          </div>`;
        }).join('')}</td>`;
      }).join('')}
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function ttRenderByInst(wrap) {
  if (!S.timetable) { wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray-500)">No timetable.</div>'; return; }
  const instSess = {};
  Object.entries(S.timetable.entries).forEach(([code, secs]) => {
    secs.forEach((s, si) => {
      const key = s.iid || 'TBA';
      if (!instSess[key]) instSess[key] = { name: s.iname || 'TBA', sessions: [] };
      if (s.lecSlot) instSess[key].sessions.push({ code, sec: `S${si + 1}`, type: 'Lecture', slot: s.lecSlot, room: s.lecRoom });
      if (s.labSlot) instSess[key].sessions.push({ code, sec: `S${si + 1}`, type: 'Lab', slot: s.labSlot, room: s.labRoom });
    });
  });
  const filterDay = ttState && ttState.day !== 'all' ? ttState.day : null;
  wrap.innerHTML = `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">
    <thead><tr style="background:var(--gray-50)">
      <th style="padding:10px 14px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;border-bottom:1px solid var(--gray-200);text-align:left">Instructor</th>
      <th style="padding:10px 14px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;border-bottom:1px solid var(--gray-200);border-left:1px solid var(--gray-200);text-align:left">Assigned Sessions</th>
    </tr></thead>
    <tbody>${Object.entries(instSess).map(([iid, d]) => {
      const fs = filterDay ? d.sessions.filter(s => s.slot.days.includes(filterDay)) : d.sessions;
      if (!fs.length) return '';
      return `<tr><td class="tt-inst-name">${d.name}</td><td class="tt-inst-slots">${fs.map(s => {
        const isLab = s.type === 'Lab';
        return `<div style="background:${isLab ? 'var(--cck-red-bg)' : 'var(--blue-100)'};border-left:3px solid ${isLab ? 'var(--cck-red)' : 'var(--blue-500)'};border-radius:4px;padding:5px 8px;font-size:11px;cursor:pointer" onclick="caOpenDetail('${s.code}')">
          <div style="font-weight:700;font-family:monospace">${s.code} ${s.sec}</div>
          <div style="color:var(--gray-600);margin-top:1px">${s.slot.days.join(',')} ${s.slot.start}–${s.slot.end} · ${s.room || '—'}</div>
        </div>`;
      }).join('')}</td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function ttRenderByRoom(wrap) {
  if (!S.timetable) { wrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gray-500)">No timetable.</div>'; return; }
  const roomSess = {};
  Object.entries(S.timetable.entries).forEach(([code, secs]) => {
    secs.forEach((s, si) => {
      const add = (room, slot, type) => {
        if (!room || !slot) return;
        if (!roomSess[room]) roomSess[room] = { sessions: [] };
        roomSess[room].sessions.push({ code, sec: `S${si + 1}`, type, slot, iname: s.iname });
      };
      add(s.lecRoom, s.lecSlot, 'Lecture');
      add(s.labRoom, s.labSlot, 'Lab');
    });
  });
  const filterDay = ttState && ttState.day !== 'all' ? ttState.day : null;
  wrap.innerHTML = `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">
    <thead><tr style="background:var(--gray-50)">
      <th style="padding:10px 14px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;border-bottom:1px solid var(--gray-200);text-align:left">Room</th>
      <th style="padding:10px 14px;font-size:11px;font-weight:600;color:var(--gray-500);text-transform:uppercase;border-bottom:1px solid var(--gray-200);border-left:1px solid var(--gray-200);text-align:left">Scheduled Sessions</th>
    </tr></thead>
    <tbody>${Object.entries(roomSess).sort(([a], [b]) => a.localeCompare(b)).map(([room, d]) => {
      const fs = filterDay ? d.sessions.filter(s => s.slot.days.includes(filterDay)) : d.sessions;
      if (!fs.length) return '';
      return `<tr><td class="tt-inst-name" style="font-family:monospace;font-size:12px">${room}</td><td class="tt-inst-slots">${fs.map(s => {
        const isLab = s.type === 'Lab';
        return `<div style="background:${isLab ? 'var(--cck-red-bg)' : 'var(--blue-100)'};border-left:3px solid ${isLab ? 'var(--cck-red)' : 'var(--blue-500)'};border-radius:4px;padding:5px 8px;font-size:11px;cursor:pointer" onclick="caOpenDetail('${s.code}')">
          <div style="font-weight:700;font-family:monospace">${s.code} ${s.sec}</div>
          <div style="color:var(--gray-600);margin-top:1px">${s.slot.days.join(',')} ${s.slot.start}–${s.slot.end} · ${(s.iname || 'TBA').split(' ').slice(-1)[0]}</div>
        </div>`;
      }).join('')}</td></tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function ttGenerate() {
  if (!S.plan) buildPlan();
  cckToast('Generating conflict-free timetable from portal data…');
  setTimeout(() => {
    const tt = runScheduler();
    renderTT();
    cckToast('Timetable generated · ' + tt.conflicts + ' conflict' + (tt.conflicts !== 1 ? 's' : ''), tt.conflicts > 0 ? 'warn' : 'ok');
  }, 80);
}

function ttDay(day, btn) {
  ttState.day = day;
  document.querySelectorAll('#tt-root .tt-dbtn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (S.timetable) ttRenderDisplay();
}
function ttView(v, btn) {
  ttState.view = v;
  document.querySelectorAll('.tt-vtgl-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (S.timetable) ttRenderDisplay();
}
function ttExportCSV() {
  if (!S.timetable) { cckToast('Generate a timetable first', 'warn'); return; }
  const rows = [['Code', 'Course', 'Section', 'Type', 'Instructor', 'Days', 'Start', 'End', 'Room']];
  Object.entries(S.timetable.entries).forEach(([code, secs]) => {
    const row = S.plan && S.plan.find(r => r.code === code);
    secs.forEach((s, i) => {
      if (s.lecSlot) rows.push([code, row ? row.name : '', `S${i + 1}`, 'Lecture', s.iname || 'TBA', s.lecSlot.days.join('+'), s.lecSlot.start, s.lecSlot.end, s.lecRoom || '']);
      if (s.labSlot) rows.push([code, row ? row.name : '', `S${i + 1}`, 'Lab', s.iname || 'TBA', s.labSlot.days.join('+'), s.labSlot.start, s.labSlot.end, s.labRoom || '']);
    });
  });
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'CCK_Timetable.csv';
  a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────────────────────
function cckToast(msg, type) {
  let tc = document.getElementById('toast-container');
  if (!tc) {
    tc = document.createElement('div');
    tc.id = 'toast-container';
    tc.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(tc);
  }
  const d = document.createElement('div');
  const bg = type === 'warn' ? 'var(--orange-500)' : type === 'ok' ? '#15803D' : 'var(--gray-900)';
  d.style.cssText = `background:${bg};color:white;padding:11px 16px;border-radius:var(--radius);font-size:13px;font-weight:500;font-family:var(--font-sans);box-shadow:0 4px 18px rgba(0,0,0,.14);max-width:320px;`;
  d.textContent = msg;
  tc.appendChild(d);
  setTimeout(() => d.remove(), 3400);
}

// ─────────────────────────────────────────────────────────────────────────────
//  EXPOSE GLOBALS
// ─────────────────────────────────────────────────────────────────────────────
window.caF = caF; window.caSearch = caSearch; window.caView = caView;
window.caOpenForecast = caOpenForecast; window.caCloseForecast = caCloseForecast;
window.fcTab = fcTab; window.fcUpdateTotal = fcUpdateTotal;
window.fcPassSearch = fcPassSearch; window.fcSyncPassRate = fcSyncPassRate;
window.caSaveForecast = caSaveForecast;
window.caGenTT = caGenTT; window.caOpenDetail = caOpenDetail; window.caPnClose = caPnClose;
window.caSecInst = caSecInst; window.caSecRoom = caSecRoom;
window.ttGenerate = ttGenerate; window.ttDay = ttDay; window.ttView = ttView; window.ttExportCSV = ttExportCSV;

})();
