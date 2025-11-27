<?php

declare(strict_types=1);

namespace OCA\VoiceassistAdmin\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class ProxyController extends Controller {
    private string $apiBase;

    public function __construct(string $AppName, IRequest $request) {
        parent::__construct($AppName, $request);
        $this->apiBase = rtrim(getenv('VOICEASSIST_API_BASE') ?: 'http://localhost:8000', '/');
    }

    private function endpoint(string $path): array {
        return [
            'forward_to' => $this->apiBase . $path,
        ];
    }

    public function status(): DataResponse {
        return new DataResponse([
            'api_base' => $this->apiBase,
            'calendar' => $this->apiBase . '/api/integrations/calendar',
            'files' => $this->apiBase . '/api/integrations/files',
            'contacts' => $this->apiBase . '/api/integrations/contacts',
            'email' => $this->apiBase . '/api/integrations/email',
        ]);
    }

    public function calendar(): DataResponse {
        return new DataResponse($this->endpoint('/api/integrations/calendar/events'));
    }

    public function files(): DataResponse {
        return new DataResponse($this->endpoint('/api/integrations/files'));
    }

    public function contacts(): DataResponse {
        return new DataResponse($this->endpoint('/api/integrations/contacts'));
    }

    public function email(): DataResponse {
        return new DataResponse($this->endpoint('/api/integrations/email'));
    }
}
