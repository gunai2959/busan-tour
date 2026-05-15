const { fetchAPI, handleError } = require('./utils.js');

/**
 * 부산 명소 정보 API
 * GET /api/attractions?pageNo=1&numOfRows=10
 * GET /api/attractions?contentId=255&resultType=json
 */
module.exports = async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );
    
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // GET 요청만 허용
    if (req.method !== 'GET') {
        return handleError(res, 'GET 요청만 허용됩니다', 405);
    }

    try {
        const { pageNo = '1', numOfRows = '10', contentId, resultType = 'json' } = req.query;

        // 서비스 키 확인
        const serviceKey = process.env.BUSAN_API_KEY;
        if (!serviceKey) {
            console.error('API 키가 환경변수에 설정되지 않았습니다');
            return handleError(res, 'API 서버 설정 오류', 500);
        }

        // 요청 URL 구성
        const baseUrl = 'http://apis.data.go.kr/6260000/AttractionService/getAttractionKr';
        
        let url = `${baseUrl}?ServiceKey=${encodeURIComponent(serviceKey)}`;
        url += `&pageNo=${pageNo}`;
        url += `&numOfRows=${numOfRows}`;
        url += `&resultType=${resultType}`;

        // contentId가 있으면 추가 (특정 명소 조회)
        if (contentId) {
            url += `&UC_SEQ=${contentId}`;
        }

        console.log('API 요청:', url.replace(serviceKey, '***'));

        // API 호출
        const data = await fetchAPI(url);

        // 응답 캐싱 헤더 추가 (5분)
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.status(200).json({
            resultCode: data.resultCode || '00',
            resultMsg: data.resultMsg || 'OK',
            items: data.items || [],
            pageNo: parseInt(pageNo),
            numOfRows: parseInt(numOfRows),
            totalCount: data.totalCount || 0
        });

    } catch (error) {
        console.error('API 오류:', error);
        return handleError(res, error.message || 'API 요청 중 오류가 발생했습니다', 500);
    }
}
