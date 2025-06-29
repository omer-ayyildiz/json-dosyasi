import 'package:http/http.dart' as http;
import 'package:html/parser.dart' as parser;
import 'package:html/dom.dart';
import 'dart:convert';

Future<List<Map<String, String>>> fetchOGMDuyurular() async {
  final url = Uri.parse('https://www.ogm.gov.tr/tr/duyurular');
  final headers = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8"
  };

  final response = await http.get(url, headers: headers);

  if (response.statusCode == 200) {
    final document = parser.parse(response.body);
    final items = document.querySelectorAll('li.item');

    final List<Map<String, String>> duyuruList = [];

    for (var item in items) {
      final content = item.querySelector('.content a');
      final dateDiv = item.querySelector('.date');
      if (content == null || dateDiv == null) continue;

      final gun = dateDiv.nodes.isNotEmpty
          ? dateDiv.nodes[0].text?.trim() ?? ''
          : '';
      final aylar = dateDiv.querySelectorAll('span');
      final ay = aylar.isNotEmpty ? aylar[0].text.trim() : '';
      final yil = aylar.length > 1 ? aylar[1].text.trim() : '';

      final href = content.attributes['href'] ?? '';
      final duyuruUrl = href.startsWith('http')
          ? href
          : 'https://www.ogm.gov.tr$href';

      duyuruList.add({
        'title': content.text.trim(),
        'url': duyuruUrl,
        'date': '$gun $ay $yil'.trim(),
      });
    }

    return duyuruList;
  } else {
    throw Exception('Sayfa yüklenemedi! [${response.statusCode}]');
  }
}

void main() async {
  final duyurular = await fetchOGMDuyurular();
  print(jsonEncode(duyurular));
}
