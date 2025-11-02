const axios = require('axios');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

/**
 * Service để phân tích CV từ các định dạng file khác nhau (PDF, DOC, DOCX, ảnh)
 * Trích xuất thông tin quan trọng: tên, email, số điện thoại, kinh nghiệm, kỹ năng, học vấn
 */

/**
 * Phân tích file PDF và trích xuất văn bản
 * @param {string} filePath - Đường dẫn đến file PDF
 * @returns {Promise<string>} - Văn bản được trích xuất từ PDF
 */
const parsePDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF file');
  }
};

/**
 * Tải và phân tích file từ URL
 * @param {string} fileUrl - URL của file cần phân tích
 * @returns {Promise<Object>} - Dữ liệu được trích xuất từ file
 */
const parseFileFromUrl = async (fileUrl) => {
  try {
    // Tải file từ URL
    const response = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'arraybuffer'
    });

    // Lấy extension của file
    const urlParts = fileUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const fileExtension = fileName.split('.').pop().toLowerCase().split('?')[0];
    
    // Tạo file tạm thời
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `${Date.now()}_${fileName}`);
    fs.writeFileSync(tempFilePath, response.data);

    let extractedText = '';
    
    // Xử lý dựa trên loại file
    if (fileExtension === 'pdf') {
      extractedText = await parsePDF(tempFilePath);
    } else if (['doc', 'docx'].includes(fileExtension)) {
      // Với file DOC/DOCX, chúng ta cần sử dụng thư viện khác
      // Hiện tại chỉ log và trả về thông báo
      console.log(`DOC/DOCX file detected: ${fileExtension}`);
      extractedText = 'Document file - requires manual review';
    } else if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExtension)) {
      // Với file ảnh, chúng ta cần OCR
      // Hiện tại chỉ log và trả về thông báo
      console.log(`Image file detected: ${fileExtension}`);
      extractedText = 'Image file - requires OCR processing';
    } else {
      extractedText = 'Unsupported file format';
    }

    // Xóa file tạm thời
    fs.unlinkSync(tempFilePath);

    return {
      fileName,
      fileExtension,
      extractedText,
      fileUrl
    };
  } catch (error) {
    console.error('Error parsing file from URL:', error);
    throw new Error('Failed to parse file from URL');
  }
};

/**
 * Trích xuất thông tin cá nhân từ văn bản
 * @param {string} text - Văn bản cần phân tích
 * @returns {Object} - Thông tin cá nhân được trích xuất
 */
const extractPersonalInfo = (text) => {
  const result = {
    name: '',
    email: '',
    phone: ''
  };

  // Regex patterns để trích xuất thông tin
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const phonePattern = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  
  // Tìm email
  const emailMatches = text.match(emailPattern);
  if (emailMatches && emailMatches.length > 0) {
    result.email = emailMatches[0];
  }

  // Tìm số điện thoại
  const phoneMatches = text.match(phonePattern);
  if (phoneMatches && phoneMatches.length > 0) {
    result.phone = phoneMatches[0];
  }

  // Tìm tên (cố gắng tìm pattern tên phổ biến)
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Kiểm tra nếu dòng có vẻ như tên (ở đầu file, không chứa số hoặc ký tự đặc biệt)
    if (trimmedLine.length > 3 && 
        trimmedLine.length < 50 && 
        !/\d/.test(trimmedLine) && 
        !/@/.test(trimmedLine) &&
        !/http/.test(trimmedLine)) {
      result.name = trimmedLine;
      break;
    }
  }

  return result;
};

/**
 * Trích xuất thông tin kinh nghiệm làm việc
 * @param {string} text - Văn bản cần phân tích
 * @returns {Array} - Danh sách kinh nghiệm làm việc
 */
const extractExperience = (text) => {
  const experiences = [];
  
  // Tìm các từ khóa liên quan đến kinh nghiệm
  const experienceKeywords = [
    'experience', 'work', 'employment', 'job', 'career', 'position',
    'kinh nghiệm', 'làm việc', 'công việc', 'vị trí', 'con ty'
  ];
  
  const lines = text.split('\n');
  let currentExperience = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase().trim();
    
    // Kiểm tra nếu dòng bắt đầu bằng từ khóa kinh nghiệm
    for (const keyword of experienceKeywords) {
      if (line.includes(keyword)) {
        if (currentExperience) {
          experiences.push(currentExperience);
        }
        
        // Lấy các dòng tiếp theo để lấy thông tin kinh nghiệm
        let description = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.match(/^\d{4}|\d{1,2}\/\d{4}$/)) {
            description += nextLine + ' ';
          } else {
            break;
          }
        }
        
        currentExperience = {
          title: line,
          description: description.trim(),
          years: extractYears(text.substring(i * 50, (i + 10) * 50)) // Tìm số năm kinh nghiệm
        };
        break;
      }
    }
  }
  
  if (currentExperience) {
    experiences.push(currentExperience);
  }
  
  return experiences;
};

/**
 * Trích xuất số năm kinh nghiệm từ văn bản
 * @param {string} text - Văn bản cần phân tích
 * @returns {number} - Số năm kinh nghiệm
 */
const extractYears = (text) => {
  // Tìm pattern như "5 years", "5+ years", "5 năm", "5+ năm"
  const yearPatterns = [
    /(\d+)\+?\s*(years?|năm)/gi,
    /(\d+)\s*\+\s*(years?|năm)/gi
  ];
  
  for (const pattern of yearPatterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }
  
  return 0;
};

/**
 * Trích xuất kỹ năng từ văn bản
 * @param {string} text - Văn bản cần phân tích
 * @returns {Array} - Danh sách kỹ năng
 */
const extractSkills = (text) => {
  const skills = [];
  
  // Danh sách các kỹ năng phổ biến
  const commonSkills = [
    'javascript', 'python', 'java', 'react', 'node.js', 'html', 'css', 'sql',
    'mongodb', 'mysql', 'postgresql', 'aws', 'azure', 'docker', 'kubernetes',
    'git', 'agile', 'scrum', 'project management', 'leadership',
    'communication', 'teamwork', 'problem solving', 'analytical',
    'web development', 'mobile development', 'data science', 'machine learning',
    'artificial intelligence', 'cloud computing', 'devops', 'cybersecurity',
    'blockchain', 'ui/ux design', 'graphic design', 'digital marketing',
    'business management', 'finance', 'accounting', 'language learning',
    'photography', 'video editing', 'music production'
  ];
  
  const lowerText = text.toLowerCase();
  
  for (const skill of commonSkills) {
    if (lowerText.includes(skill)) {
      skills.push(skill);
    }
  }
  
  // Tìm kỹ năng trong các section như "Skills:", "Technical Skills:", etc.
  const skillSectionPattern = /(skills?|technical skills?|kỹ năng):(.+?)(\n\n|\n[A-Z]|\n[0-9]|\n#|$)/gi;
  const skillMatch = text.match(skillSectionPattern);
  
  if (skillMatch) {
    const skillText = skillMatch[2];
    const skillList = skillText.split(/[,;•\-\n]/);
    
    for (const skill of skillList) {
      const trimmedSkill = skill.trim();
      if (trimmedSkill && trimmedSkill.length > 1 && trimmedSkill.length < 50) {
        if (!skills.includes(trimmedSkill.toLowerCase())) {
          skills.push(trimmedSkill.toLowerCase());
        }
      }
    }
  }
  
  return [...new Set(skills)]; // Remove duplicates
};

/**
 * Trích xuất thông tin học vấn
 * @param {string} text - Văn bản cần phân tích
 * @returns {Array} - Danh sách học vấn
 */
const extractEducation = (text) => {
  const education = [];
  
  // Tìm các từ khóa liên quan đến học vấn
  const educationKeywords = [
    'education', 'university', 'college', 'degree', 'bachelor', 'master', 'phd',
    'học vấn', 'đại học', 'cao đẳng', 'cử nhân', 'thạc sĩ', 'tiến sĩ'
  ];
  
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase().trim();
    
    for (const keyword of educationKeywords) {
      if (line.includes(keyword)) {
        // Lấy các dòng tiếp theo để lấy thông tin học vấn
        let description = '';
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].trim();
          if (nextLine && !nextLine.match(/^\d{4}|\d{1,2}\/\d{4}$/)) {
            description += nextLine + ' ';
          } else {
            break;
          }
        }
        
        education.push({
          type: keyword,
          description: description.trim()
        });
        break;
      }
    }
  }
  
  return education;
};

/**
 * Phân tích CV và trích xuất tất cả thông tin quan trọng
 * @param {Array} documentUrls - Mảng các URL của tài liệu
 * @returns {Promise<Object>} - Kết quả phân tích CV
 */
const analyzeCV = async (documentUrls) => {
  try {
    if (!documentUrls || documentUrls.length === 0) {
      return {
        success: false,
        error: 'No documents provided'
      };
    }

    const analysisResults = {
      personalInfo: {},
      experience: [],
      skills: [],
      education: [],
      documents: [],
      overallScore: 0,
      recommendations: []
    };

    // Phân tích từng tài liệu
    for (const docUrl of documentUrls) {
      try {
        const parsedFile = await parseFileFromUrl(docUrl);
        
        // Trích xuất thông tin từ văn bản
        const personalInfo = extractPersonalInfo(parsedFile.extractedText);
        const experience = extractExperience(parsedFile.extractedText);
        const skills = extractSkills(parsedFile.extractedText);
        const education = extractEducation(parsedFile.extractedText);
        
        // Cập nhật kết quả
        if (!analysisResults.personalInfo.name && personalInfo.name) {
          analysisResults.personalInfo = personalInfo;
        }
        
        analysisResults.experience = [...analysisResults.experience, ...experience];
        analysisResults.skills = [...new Set([...analysisResults.skills, ...skills])];
        analysisResults.education = [...analysisResults.education, ...education];
        
        analysisResults.documents.push({
          url: docUrl,
          type: parsedFile.fileExtension,
          name: parsedFile.fileName,
          parsed: true
        });
      } catch (error) {
        console.error(`Error analyzing document ${docUrl}:`, error);
        analysisResults.documents.push({
          url: docUrl,
          parsed: false,
          error: error.message
        });
      }
    }

    // Tính điểm tổng hợp
    analysisResults.overallScore = calculateOverallScore(analysisResults);
    
    // Tạo đề xuất
    analysisResults.recommendations = generateRecommendations(analysisResults);

    return {
      success: true,
      data: analysisResults
    };
  } catch (error) {
    console.error('Error analyzing CV:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Tính điểm tổng hợp cho hồ sơ
 * @param {Object} analysisResults - Kết quả phân tích
 * @returns {number} - Điểm từ 0-100
 */
const calculateOverallScore = (analysisResults) => {
  let score = 0;
  
  // Điểm thông tin cá nhân (tối đa 20 điểm)
  if (analysisResults.personalInfo.name) score += 5;
  if (analysisResults.personalInfo.email) score += 5;
  if (analysisResults.personalInfo.phone) score += 5;
  if (analysisResults.personalInfo.name && analysisResults.personalInfo.email && analysisResults.personalInfo.phone) {
    score += 5; // Bonus nếu có đủ thông tin
  }
  
  // Điểm kinh nghiệm (tối đa 30 điểm)
  if (analysisResults.experience.length > 0) {
    score += Math.min(20, analysisResults.experience.length * 5);
    
    // Kiểm tra số năm kinh nghiệm
    const totalYears = analysisResults.experience.reduce((sum, exp) => sum + (exp.years || 0), 0);
    if (totalYears >= 5) score += 10;
    else if (totalYears >= 2) score += 5;
  }
  
  // Điểm kỹ năng (tối đa 30 điểm)
  if (analysisResults.skills.length > 0) {
    score += Math.min(20, analysisResults.skills.length * 2);
    
    // Bonus cho các kỹ năng liên quan đến teaching/tech
    const relevantSkills = analysisResults.skills.filter(skill => 
      ['teaching', 'training', 'mentoring', 'javascript', 'python', 'react', 'node.js'].includes(skill)
    );
    score += Math.min(10, relevantSkills.length * 2);
  }
  
  // Điểm học vấn (tối đa 20 điểm)
  if (analysisResults.education.length > 0) {
    score += Math.min(15, analysisResults.education.length * 5);
    
    // Bonus cho các bằng cấp cao
    const hasAdvancedDegree = analysisResults.education.some(edu => 
      edu.description.toLowerCase().includes('master') || 
      edu.description.toLowerCase().includes('phd') ||
      edu.description.toLowerCase().includes('thạc sĩ') ||
      edu.description.toLowerCase().includes('tiến sĩ')
    );
    if (hasAdvancedDegree) score += 5;
  }
  
  return Math.min(100, score);
};

/**
 * Tạo đề xuất dựa trên kết quả phân tích
 * @param {Object} analysisResults - Kết quả phân tích
 * @returns {Array} - Danh sách đề xuất
 */
const generateRecommendations = (analysisResults) => {
  const recommendations = [];
  
  // Kiểm tra thông tin cá nhân
  if (!analysisResults.personalInfo.name || !analysisResults.personalInfo.email || !analysisResults.personalInfo.phone) {
    recommendations.push('Cần cập nhật đầy đủ thông tin cá nhân (tên, email, số điện thoại)');
  }
  
  // Kiểm tra kinh nghiệm
  if (analysisResults.experience.length === 0) {
    recommendations.push('Nên thêm kinh nghiệm làm việc liên quan đến lĩnh vực giảng dạy');
  } else if (analysisResults.experience.length < 2) {
    recommendations.push('Nên bổ sung thêm kinh nghiệm làm việc để tăng độ tin cậy');
  }
  
  // Kiểm tra kỹ năng
  if (analysisResults.skills.length < 5) {
    recommendations.push('Nêu rõ các kỹ năng chuyên môn để chứng minh năng lực');
  }
  
  // Kiểm tra học vấn
  if (analysisResults.education.length === 0) {
    recommendations.push('Cần cung cấp thông tin về học vấn và bằng cấp');
  }
  
  // Kiểm tra tài liệu
  const unparsedDocs = analysisResults.documents.filter(doc => !doc.parsed);
  if (unparsedDocs.length > 0) {
    recommendations.push('Một số tài liệu không thể đọc được. Vui lòng tải lên định dạng PDF hoặc ảnh rõ nét');
  }
  
  return recommendations;
};

module.exports = {
  analyzeCV,
  parseFileFromUrl,
  extractPersonalInfo,
  extractExperience,
  extractSkills,
  extractEducation,
  calculateOverallScore,
  generateRecommendations
};