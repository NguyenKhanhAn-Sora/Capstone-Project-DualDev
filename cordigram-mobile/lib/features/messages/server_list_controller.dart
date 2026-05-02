import 'package:flutter/foundation.dart';

import 'models/server_models.dart';
import 'services/servers_service.dart';

class ServerListController extends ChangeNotifier {
  final List<ServerSummary> _servers = [];
  bool _loading = false;
  String? _error;
  String? _selectedServerId;

  List<ServerSummary> get servers => List.unmodifiable(_servers);
  bool get loading => _loading;
  String? get error => _error;
  String? get selectedServerId => _selectedServerId;

  Future<void> loadServers() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final fetched = await ServersService.getMyServers();
      _servers
        ..clear()
        ..addAll(fetched);
      if (_selectedServerId == null && _servers.isNotEmpty) {
        _selectedServerId = _servers.first.id;
      } else if (_selectedServerId != null &&
          !_servers.any((e) => e.id == _selectedServerId)) {
        _selectedServerId = _servers.isEmpty ? null : _servers.first.id;
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void selectServer(String serverId) {
    if (_selectedServerId == serverId) return;
    _selectedServerId = serverId;
    notifyListeners();
  }

  Future<ServerSummary?> createServer({
    required String name,
    String? description,
    String? avatarUrl,
    String template = 'custom',
    String purpose = 'me-and-friends',
    String language = 'vi',
  }) async {
    final created = await ServersService.createServer(
      name: name,
      description: description,
      avatarUrl: avatarUrl,
      template: template,
      purpose: purpose,
      language: language,
    );
    if (created == null) return null;
    _servers.insert(0, created);
    _selectedServerId = created.id;
    notifyListeners();
    return created;
  }
}
