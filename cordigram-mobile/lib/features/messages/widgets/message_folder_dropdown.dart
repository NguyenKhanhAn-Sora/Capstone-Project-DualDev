import 'package:flutter/material.dart';

class MessageFolderDropdown extends StatelessWidget {
  const MessageFolderDropdown({
    super.key,
    required this.title,
    required this.isExpanded,
    required this.onToggle,
  });

  final String title;
  final bool isExpanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            title,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.1,
            ),
          ),
        ),
        const SizedBox(width: 1),
        IconButton(
          constraints: const BoxConstraints.tightFor(width: 24, height: 24),
          padding: EdgeInsets.zero,
          splashRadius: 16,
          onPressed: onToggle,
          icon: AnimatedRotation(
            turns: isExpanded ? 0.25 : 0,
            duration: const Duration(milliseconds: 180),
            child: const Icon(
              Icons.arrow_forward,
              color: Colors.white,
              size: 16,
            ),
          ),
        ),
      ],
    );
  }
}

class MessageQuickMenuDropdown extends StatelessWidget {
  const MessageQuickMenuDropdown({
    super.key,
    required this.items,
    required this.onSelected,
  });

  final List<String> items;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF0A1737),
        border: Border.all(color: const Color(0xFF4D5A78)),
      ),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            ListTile(
              dense: true,
              title: Center(
                child: Text(
                  items[i],
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              onTap: () => onSelected(items[i]),
            ),
            if (i < items.length - 1)
              const Divider(height: 1, thickness: 1, color: Color(0xFF4D5A78)),
          ],
        ],
      ),
    );
  }
}
