/**
 * 외부 API에 요청을 보내고 JSON으로 파싱하는 함수
 * @param {string} url - 요청 URL
 * @param {object} options - fetch 옵션
 * @returns {Promise<object>} 파싱된 응답
 */
async function fetchAPI(url, options = {}) {
    const defaultOptions = {
        method: 'GET',
        timeout: 10000,
        ...options
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), defaultOptions.timeout);

        const response = await fetch(url, {
            ...defaultOptions,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else if (contentType && contentType.includes('text/xml')) {
            // XML을 JSON으로 변환 (간단한 방식)
            const text = await response.text();
            data = parseXMLtoJSON(text);
        } else {
            const text = await response.text();
            data = { body: text };
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('API 요청 시간 초과 (10초)');
        }
        throw error;
    }
}

/**
 * 간단한 XML to JSON 변환
 * @param {string} xml - XML 문자열
 * @returns {object} JSON 객체
 */
function parseXMLtoJSON(xml) {
    try {
        // 기본 정규식을 사용한 간단한 파싱
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            const itemXml = match[1];
            const item = {};

            // 각 태그를 추출
            const tagRegex = /<([^>]+)>([\s\S]*?)<\/\1>/g;
            let tagMatch;

            while ((tagMatch = tagRegex.exec(itemXml)) !== null) {
                const [, tag, value] = tagMatch;
                item[tag] = value.trim();
            }

            if (Object.keys(item).length > 0) {
                items.push(item);
            }
        }

        // 응답 코드 추출
        const codeMatch = xml.match(/<resultCode>([\s\S]*?)<\/resultCode>/);
        const msgMatch = xml.match(/<resultMsg>([\s\S]*?)<\/resultMsg>/);
        const countMatch = xml.match(/<totalCount>([\s\S]*?)<\/totalCount>/);

        return {
            resultCode: codeMatch ? codeMatch[1] : '00',
            resultMsg: msgMatch ? msgMatch[1] : 'OK',
            items: items,
            totalCount: countMatch ? parseInt(countMatch[1]) : items.length
        };
    } catch (err) {
        console.error('XML 파싱 오류:', err);
        return { resultCode: '01', resultMsg: '응답 파싱 오류', items: [] };
    }
}

/**
 * 에러 응답 처리
 * @param {object} res - Next.js 응답 객체
 * @param {string} message - 에러 메시지
 * @param {number} statusCode - HTTP 상태 코드
 * @returns {void}
 */
function handleError(res, message, statusCode = 400) {
    return res.status(statusCode).json({
        resultCode: statusCode.toString(),
        resultMsg: message,
        items: [],
        error: true
    });
}

/**
 * 요청 파라미터 유효성 검사
 * @param {object} params - 요청 파라미터
 * @returns {object} 검증 결과
 */
function validateParams(params) {
    const errors = [];

    const pageNo = parseInt(params.pageNo || '1');
    if (isNaN(pageNo) || pageNo < 1) {
        errors.push('pageNo는 1 이상의 정수여야 합니다');
    }

    const numOfRows = parseInt(params.numOfRows || '10');
    if (isNaN(numOfRows) || numOfRows < 1 || numOfRows > 100) {
        errors.push('numOfRows는 1~100 사이의 정수여야 합니다');
    }

    return {
        isValid: errors.length === 0,
        errors: errors,
        pageNo: pageNo,
        numOfRows: numOfRows
    };
}

/**
 * 요청 로깅
 * @param {object} req - 요청 객체
 * @param {string} endpoint - 엔드포인트 이름
 */
function logRequest(req, endpoint) {
    const timestamp = new Date().toISOString();
    const query = JSON.stringify(req.query);
    console.log(`[${timestamp}] ${endpoint} - ${req.method} ${req.url} - ${query}`);
}

/**
 * 응답 데이터 포맷팅
 * @param {object} data - 응답 데이터
 * @param {number} pageNo - 페이지 번호
 * @param {number} numOfRows - 페이지당 항목 수
 * @returns {object} 포맷된 응답
 */
function formatResponse(data, pageNo = 1, numOfRows = 10) {
    return {
        resultCode: data.resultCode || '00',
        resultMsg: data.resultMsg || 'OK',
        pageNo: pageNo,
        numOfRows: numOfRows,
        totalCount: data.totalCount || (data.items ? data.items.length : 0),
        items: Array.isArray(data.items) ? data.items : []
    };
}

/**
 * 응답 캐시 키 생성
 * @param {object} params - 요청 파라미터
 * @returns {string} 캐시 키
 */
function getCacheKey(params) {
    const { pageNo = '1', numOfRows = '10', contentId = '' } = params;
    return `attractions_${pageNo}_${numOfRows}_${contentId}`.toLowerCase();
}

/**
 * 데이터 캐시 저장 (메모리)
 */
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5분

/**
 * 캐시에서 데이터 조회
 * @param {string} key - 캐시 키
 * @returns {object|null} 캐시된 데이터
 */
function getFromCache(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    cache.delete(key);
    return null;
}

/**
 * 캐시에 데이터 저장
 * @param {string} key - 캐시 키
 * @param {object} data - 저장할 데이터
 */
function setCache(key, data) {
    cache.set(key, {
        data: data,
        timestamp: Date.now()
    });
}

/**
 * 캐시 초기화
 */
function clearCache() {
    cache.clear();
}

/**
 * Vercel 환경 확인
 * @returns {boolean} Vercel 환경 여부
 */
function isVercelEnv() {
    return process.env.VERCEL === '1';
}

/**
 * 환경 정보 반환
 * @returns {object} 환경 정보
 */
function getEnvInfo() {
    return {
        isProduction: process.env.NODE_ENV === 'production',
        isVercel: isVercelEnv(),
        region: process.env.VERCEL_REGION || 'unknown'
    };
}

// CommonJS export
module.exports = {
    fetchAPI,
    handleError,
    validateParams,
    logRequest,
    formatResponse,
    getCacheKey,
    getFromCache,
    setCache,
    clearCache,
    isVercelEnv,
    getEnvInfo,
    parseXMLtoJSON: parseXMLtoJSON
};
