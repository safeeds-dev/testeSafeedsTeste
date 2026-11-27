<?php
/*
 * Texto do termo. NUNCA altere uma versão já usada: crie uma nova versão
 * e mude TERMO_ATUAL. Cada autorização guarda a versão e o hash do texto que o produtor aceitou.
 */
declare(strict_types=1);
if (!defined('AUTZ')) { http_response_code(404); exit; }

const TERMO_ATUAL = '1';

const TERMOS = [
    '1' => [
        'titulo' => 'Termo de autorização de uso de imagem, voz e depoimentos',
        'paragrafos' => [
            'Eu, identificado(a) pelos dados informados neste formulário, autorizo e concedo à SAFEAGRO AGROCIENCIA LTDA. com sede na Rodovia PR 182, S/N, Jd. Porto Alegre, Toledo, PR, Brasil, CEP: 85906-300, inscrita no CNPJ/MF sob o nº 15.708.174/0001-80, doravante denominada simplesmente SAFEAGRO, por si ou empresas de seu mesmo grupo econômico, o direito de uso da minha imagem, voz, graciosamente, sem qualquer tipo de limite, inclusive de caráter temporal, bem como de meus depoimentos e divulgação dos resultados obtidos, podendo expor, reproduzir, distribuir, utilizar ou veicular referidas imagens e depoimentos em meios físicos ou digitais, tais como: folhetos, catálogos, sites, redes sociais, apresentações, vídeos e outros meios de comunicação, entre outros, para quaisquer fins, inclusive para fins comerciais ou promocionais, sem que qualquer remuneração me seja devida, a qualquer título e a qualquer tempo.',
            'Esta autorização é concedida por prazo indeterminado, sem qualquer ônus para a SAFEAGRO. A SAFEAGRO poderá livremente alterar, retocar ou realizar qualquer trabalho de arte final sobre qualquer imagem, sem a necessidade de qualquer tipo de autorização prévia. Não será necessário que a SAFEAGRO mencione em seus materiais e publicações o meu nome, podendo, no entanto, fazê-lo se assim julgar conveniente.',
        ],
        'aceite' => 'Declaro que li e compreendi o termo acima e autorizo o uso da minha imagem, voz, depoimentos e divulgação dos resultados obtidos nas condições nele descritas. Confirmo que a assinatura feita nesta tela é minha e foi fornecida para esta autorização.',
    ],
];

function termo(string $versao = TERMO_ATUAL): array {
    if (!isset(TERMOS[$versao])) throw new RuntimeException('termo_inexistente');
    $t = TERMOS[$versao];
    $t['versao'] = $versao;
    $t['hash'] = hash('sha256', $t['titulo'] . "\n" . implode("\n", $t['paragrafos']) . "\n" . $t['aceite']);
    return $t;
}
